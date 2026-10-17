// Reviews advertising campaigns. Nothing runs until a person has approved it here.
//
//   node scripts/ads.mjs list                       campaigns waiting for review
//   node scripts/ads.mjs show <campaign-id>         one campaign, in full
//   node scripts/ads.mjs approve <campaign-id>      let it run (the account needs a balance)
//   node scripts/ads.mjs reject <campaign-id> <reason...>   not approved; the advertiser sees the reason
//   node scripts/ads.mjs pause <campaign-id>        stop a running campaign (the advertiser can resume it)
//   node scripts/ads.mjs end <campaign-id>          end a campaign for good
//   node scripts/ads.mjs suspend <account-id>       stop every campaign on an advertising account
//   node scripts/ads.mjs unsuspend <account-id>     start the account's campaigns again
//   node scripts/ads.mjs reports                    reports people have sent about ads, newest first
//
// Reads and writes the database the app uses (DATABASE_URL). The app can keep running.
// Every decision is written to the audit log with the time, so each one can be traced.
import crypto from "node:crypto"
import postgres from "postgres"

const [command, ...rest] = process.argv.slice(2)

const USAGE = "Usage: node scripts/ads.mjs list | show <id> | approve <id> | reject <id> <reason> | pause <id> | end <id> | suspend <account> | unsuspend <account> | reports"

if (!command) {
  console.error(USAGE)
  process.exit(1)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Set it to the Postgres database the app uses.")
  process.exit(1)
}

// Counts, timestamps and flags come back as plain numbers, as they did from SQLite.
const sql = postgres(url, {
  max: 1,
  prepare: false,
  types: {
    number: {
      to: 0,
      from: [16, 20, 1700],
      parse: (value) => (value === "t" ? 1 : value === "f" ? 0 : Number(value)),
      serialize: (value) => String(value),
    },
  },
})
const now = Date.now()

async function campaign(id) {
  const [row] = await sql.unsafe(
    `SELECT c.*, a.business_name, a.balance_micro, a.status AS account_status, a.user_id
     FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id WHERE c.id = $1`,
    [id ?? ""]
  )
  return row
}

// Every decision is kept in ad_decisions, so each one can be traced to a time.
async function audit(action, target, detail) {
  await sql.unsafe("INSERT INTO ad_decisions (id, action, target, detail, created_at) VALUES ($1, $2, $3, $4, $5)", [
    crypto.randomUUID(),
    action,
    target,
    detail,
    now,
  ])
}

const money = (micro) => `${(micro / 1_000_000).toFixed(2)}`

try {
  switch (command) {
    case "list": {
      const rows = await sql.unsafe(
        `SELECT c.id, c.headline, c.body, c.cta, c.link_url, c.topic, c.budget_micro, a.business_name, a.country
         FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id WHERE c.status = 'in_review' ORDER BY c.created_at`
      )
      if (rows.length === 0) console.log("Nothing is waiting for review.")
      for (const row of rows) {
        console.log(`${row.id}  ${row.business_name} (${row.country})  budget ${money(row.budget_micro)}`)
        console.log(`    ${row.headline} | ${row.body} | ${row.cta} -> ${row.link_url}${row.topic ? ` | topic #${row.topic}` : ""}`)
      }
      break
    }
    case "show": {
      const row = await campaign(rest[0])
      if (!row) throw new Error("No campaign with that id.")
      console.log(JSON.stringify({ ...row, budget: money(row.budget_micro), spent: money(row.spent_micro), balance: money(row.balance_micro) }, null, 2))
      break
    }
    case "approve": {
      const row = await campaign(rest[0])
      if (!row) throw new Error("No campaign with that id.")
      if (row.status !== "in_review") throw new Error(`The campaign is ${row.status}, not waiting for review.`)
      if (row.account_status !== "active") throw new Error("The advertising account is suspended.")
      if (row.balance_micro <= 0) throw new Error("The account has no balance yet. It needs credit before a campaign can run.")
      await sql.unsafe("UPDATE ad_campaigns SET status = 'active', review_note = NULL, reviewed_at = $1 WHERE id = $2", [now, row.id])
      await audit("ad_approved", row.id, `${row.business_name}: ${row.headline}`)
      console.log(`Approved ${row.id}. It runs from the next feed view.`)
      break
    }
    case "reject": {
      const row = await campaign(rest[0])
      const reason = rest.slice(1).join(" ").trim()
      if (!row) throw new Error("No campaign with that id.")
      if (reason.length < 3) throw new Error("Give the reason the advertiser will see.")
      await sql.unsafe("UPDATE ad_campaigns SET status = 'rejected', review_note = $1, reviewed_at = $2 WHERE id = $3", [
        reason.slice(0, 300),
        now,
        row.id,
      ])
      await audit("ad_rejected", row.id, `${row.business_name}: ${reason.slice(0, 300)}`)
      console.log(`Rejected ${row.id}.`)
      break
    }
    case "pause":
    case "end": {
      const row = await campaign(rest[0])
      if (!row) throw new Error("No campaign with that id.")
      const next = command === "pause" ? "paused" : "ended"
      if (!["active", "paused"].includes(row.status)) throw new Error(`The campaign is ${row.status}.`)
      await sql.unsafe("UPDATE ad_campaigns SET status = $1, reviewed_at = $2 WHERE id = $3", [next, now, row.id])
      await audit(`ad_${next}`, row.id, row.business_name)
      console.log(`Campaign ${row.id} is now ${next}.`)
      break
    }
    case "suspend":
    case "unsuspend": {
      const [account] = await sql.unsafe("SELECT id, business_name FROM ad_accounts WHERE id = $1", [rest[0] ?? ""])
      if (!account) throw new Error("No advertising account with that id.")
      const status = command === "suspend" ? "suspended" : "active"
      await sql.unsafe("UPDATE ad_accounts SET status = $1 WHERE id = $2", [status, account.id])
      await audit(`ad_account_${status}`, account.id, account.business_name)
      console.log(`Account ${account.id} is ${status}.`)
      break
    }
    case "reports": {
      const rows = await sql.unsafe(
        `SELECT r.reason, r.note, r.created_at, c.id AS campaign_id, c.headline, c.status, a.business_name
         FROM ad_reports r JOIN ad_campaigns c ON c.id = r.campaign_id JOIN ad_accounts a ON a.id = c.account_id
         ORDER BY r.created_at DESC LIMIT 200`
      )
      if (rows.length === 0) console.log("No reports.")
      for (const row of rows) {
        console.log(`${new Date(row.created_at).toISOString()}  ${row.campaign_id}  ${row.status}  ${row.business_name}: ${row.headline}`)
        console.log(`    reason: ${row.reason}${row.note ? ` | ${row.note}` : ""}`)
      }
      break
    }
    default:
      throw new Error(USAGE)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
