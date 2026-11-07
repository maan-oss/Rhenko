// Works through notices about content (copyright, intimate images, child abuse, impersonation, privacy, illegal
// content) and records requests from authorities. Each notice gets a decision, and the person who sent it is told.
//
//   node scripts/legal.mjs list                                 open notices, urgent ones first, then oldest first
//   node scripts/legal.mjs show <noticeId>                      everything the notice says
//   node scripts/legal.mjs decide <noticeId> actioned|rejected --note "<reason>"
//                                                               record the decision, email the sender, and change the post
//   node scripts/legal.mjs record-request --summary "<text>"    log an order or request from a court or authority
//   node scripts/legal.mjs counter-list                         counter-notices still waiting, due, or overdue
//   node scripts/legal.mjs court-action <noticeId>              the owner has started a court action: keep the post hidden
//   node scripts/legal.mjs counter-restore <noticeId>           put a post back after its counter-notice window
//   node scripts/legal.mjs overdue                              intimate-image notices past their 48-hour deadline, still open
//
// actioned: the post is hidden (if it is not already) and its author sees the reason and can appeal.
// rejected: a post hidden because of this notice is put back.
// Email goes out over RHENKO_SMTP_URL with RHENKO_MAIL_FROM. Without it, the email is printed so it can be sent by hand.
//
// Reads and writes the database the app uses (DATABASE_URL). The app can keep running.
import { randomUUID } from "node:crypto"
import nodemailer from "nodemailer"
import postgres from "postgres"

// These mirror lib/legal.ts. The e2e suite checks that they still match.
const KINDS = {
  copyright: "Copyright infringement",
  intimate_image: "Intimate image shared without consent",
  child_abuse: "Child sexual abuse material",
  impersonation: "Impersonation",
  privacy: "Private information shared without consent",
  illegal: "Other illegal content",
}
const URGENT = new Set(["intimate_image", "child_abuse"])
const APPEAL_MS = 30 * 24 * 60 * 60 * 1000
const EXCERPT_CHARS = 140
const REQUEST_KIND = "authority_request"

const USAGE = `Usage:
  node scripts/legal.mjs list
  node scripts/legal.mjs show <noticeId>
  node scripts/legal.mjs decide <noticeId> actioned|rejected --note "<reason>"
  node scripts/legal.mjs record-request --summary "<text>"
  node scripts/legal.mjs counter-list
  node scripts/legal.mjs court-action <noticeId>
  node scripts/legal.mjs counter-restore <noticeId>
  node scripts/legal.mjs overdue`

const SHAPES = {
  list: { args: 0, options: [] },
  show: { args: 1, options: [] },
  decide: { args: 2, options: ["note"] },
  "record-request": { args: 0, options: ["summary"] },
  "counter-list": { args: 0, options: [] },
  "court-action": { args: 1, options: [] },
  "counter-restore": { args: 1, options: [] },
  overdue: { args: 0, options: [] },
}
const VALUE_OPTIONS = new Set(["note", "summary"])

function fail(message) {
  console.error(message)
  process.exit(1)
}

// Text from the database and from the command line is shown with control characters escaped, so it cannot move the
// cursor or reorder the lines around it.
function plain(text) {
  return String(text ?? "").replace(
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  )
}

function when(ms) {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`
}

function field(label, text) {
  const indent = " ".repeat(9)
  return `${label.padEnd(9)}${plain(text).split("\n").join(`\n${indent}`)}`
}

function excerpt(body) {
  const flat = String(body).replace(/\s+/g, " ").trim()
  const chars = [...flat]
  return chars.length > EXCERPT_CHARS ? `${chars.slice(0, EXCERPT_CHARS).join("")}…` : flat
}

const argv = process.argv.slice(2)
const options = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  const flag = /^--([a-z-]+)(?:=(.*))?$/s.exec(arg)
  if (!flag) {
    if (arg.startsWith("-")) fail(USAGE)
    positional.push(arg)
    continue
  }
  const [, name, inline] = flag
  if (!VALUE_OPTIONS.has(name)) fail(USAGE)
  const value = inline ?? argv[++i]
  if (value === undefined) fail(`--${name} needs a value.`)
  options[name] = value
}
const [command, ...params] = positional
const shape = Object.hasOwn(SHAPES, command) ? SHAPES[command] : null
if (!shape || params.length !== shape.args) fail(USAGE)
if (Object.keys(options).some((name) => !shape.options.includes(name))) fail(USAGE)

const url = process.env.DATABASE_URL
if (!url) fail("DATABASE_URL is not set. Set it to the Postgres database the app uses.")

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

// The first row of a query on a connection (the database, or the transaction open on it), or undefined.
async function one(conn, text, ...values) {
  const [row] = await conn.unsafe(text, values)
  return row
}

function prefixOf(value, noun) {
  const prefix = String(value).trim().toLowerCase()
  if (!/^[0-9a-f-]{8,36}$/.test(prefix)) {
    fail(`"${plain(value)}" is not a ${noun} id. Copy one from the list, or give at least its first 8 characters.`)
  }
  return prefix
}

async function findNotice(value) {
  const prefix = prefixOf(value, "notice")
  const rows = await sql.unsafe("SELECT * FROM legal_notices WHERE substr(id, 1, $1) = $2 LIMIT 2", [prefix.length, prefix])
  if (rows.length === 0) fail(`There is no notice whose id starts with ${prefix}.`)
  if (rows.length > 1) fail(`More than one notice starts with ${prefix}. Give more of the id.`)
  return rows[0]
}

// The same thread tree the moderation script uses: the post and every reply under it.
const TREE = `WITH RECURSIVE tree(id) AS (
  SELECT id FROM posts WHERE id = $1
  UNION ALL
  SELECT p.id FROM posts p JOIN tree t ON p.reply_to_id = t.id
)`
async function threadIds(conn, postId) {
  const rows = await conn.unsafe(`${TREE} SELECT id FROM tree`, [postId])
  return rows.map((row) => row.id)
}

async function list() {
  const rows = await sql.unsafe(
    `SELECT id, kind, name, email, url, post_id, created_at, due_by FROM legal_notices
     WHERE status = 'open'
     ORDER BY CASE WHEN kind IN ('intimate_image', 'child_abuse') THEN 0 ELSE 1 END, created_at ASC, id ASC`
  )
  if (rows.length === 0) {
    console.log("No open notices.")
    return
  }
  const urgent = rows.filter((row) => URGENT.has(row.kind)).length
  console.log(`${rows.length} open ${rows.length === 1 ? "notice" : "notices"}${urgent > 0 ? `, ${urgent} urgent (shown first; their posts are already hidden)` : ""}.`)
  for (const row of rows) {
    console.log("")
    console.log(field("Notice", row.id))
    console.log(field("About", `${KINDS[row.kind] ?? row.kind}${URGENT.has(row.kind) ? " (urgent)" : ""}`))
    console.log(field("From", `${row.name} <${row.email}>, sent ${when(row.created_at)}`))
    if (row.due_by) console.log(field("Decide by", `${when(row.due_by)} (48 hours after it was sent)`))
    if (row.post_id) console.log(field("Post", row.post_id))
    else if (row.url) console.log(field("Link", row.url))
  }
  console.log("")
  console.log("Read one with:   node scripts/legal.mjs show <noticeId>")
  console.log("Decide with:     node scripts/legal.mjs decide <noticeId> actioned|rejected --note \"<reason>\"")
}

async function show() {
  const notice = await findNotice(params[0])
  console.log(field("Notice", notice.id))
  console.log(field("About", `${KINDS[notice.kind] ?? notice.kind}${URGENT.has(notice.kind) ? " (urgent)" : ""}`))
  console.log(field("Status", notice.status === "open" ? "open" : `${notice.status}${notice.decided_at ? `, decided ${when(notice.decided_at)}` : ""}`))
  console.log(field("Sent", when(notice.created_at)))
  if (notice.due_by) console.log(field("Decide by", `${when(notice.due_by)} (48 hours after it was sent)`))
  console.log(field("From", `${notice.name} <${notice.email}>`))
  if (notice.address) console.log(field("Address", notice.address))
  if (notice.url) console.log(field("Link", notice.url))
  if (notice.work) console.log(field("Work", notice.work))
  console.log(field("Said", notice.description))
  console.log(field("Signed", notice.signature))
  if (notice.post_id) {
    const post = await one(sql, "SELECT p.id, p.body, p.removed_at, u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = $1", notice.post_id)
    if (post) {
      console.log(field("Post", `${post.id} by @${post.handle}, ${post.removed_at ? "hidden" : "visible"}`))
      console.log(field("Text", excerpt(post.body)))
    } else {
      console.log(field("Post", `${notice.post_id} (no longer exists)`))
    }
  }
  if (notice.decision_note) console.log(field("Reason", notice.decision_note))
}

// Email to the sender. Without SMTP the message is printed so the operator can send it by hand.
async function emailSender(to, subject, text) {
  const url = process.env.RHENKO_SMTP_URL
  if (!url) {
    console.log("")
    console.log("Email isn't set up (RHENKO_SMTP_URL is not set). Send this to the sender by hand:")
    console.log(`  To: ${to}\n  Subject: ${subject}\n`)
    console.log(text.split("\n").map((line) => `  ${line}`).join("\n"))
    return false
  }
  try {
    const transport = nodemailer.createTransport(url)
    await transport.sendMail({ from: process.env.RHENKO_MAIL_FROM || "Rhenko <no-reply@localhost>", to, subject, text })
    return true
  } catch (error) {
    console.error(`The email to ${to} was not sent: ${error.message}. Send the decision by hand.`)
    return false
  }
}

async function decide() {
  const verdict = params[1]
  if (verdict !== "actioned" && verdict !== "rejected") fail("Say actioned or rejected.")
  const note = (options.note ?? "").replace(/\r\n/g, "\n").trim()
  if ([...note].length < 10) fail("Write the reason in at least 10 characters. The sender reads this.")
  if ([...note].length > 1000) fail("Keep the reason under 1,000 characters.")

  const notice = await findNotice(params[0])
  if (notice.status !== "open") fail(`That notice was already ${notice.status}.`)
  const now = Date.now()
  const post = notice.post_id ? await one(sql, "SELECT id, body, author_id, removed_at FROM posts WHERE id = $1", notice.post_id) : null
  const sourceTag = `legal:${notice.id}`

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("UPDATE legal_notices SET status = $1, decision_note = $2, decided_at = $3 WHERE id = $4", [verdict, note, now, notice.id])
      if (post && verdict === "actioned") {
        if (post.removed_at === null) {
          const ids = await threadIds(tx, post.id)
          await tx.unsafe("UPDATE posts SET removed_at = $1 WHERE id = ANY($2::text[])", [now, ids])
          await tx.unsafe(
            `INSERT INTO moderation_notices (id, user_id, post_id, category, explanation, excerpt, source, created_at, appeal_until)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [randomUUID(), post.author_id, post.id, notice.kind, note, excerpt(post.body), sourceTag, now, now + APPEAL_MS]
          )
        } else {
          // Hidden while the notice was open: the author's notice now carries the decision instead of the interim reason.
          await tx.unsafe(
            "UPDATE moderation_notices SET explanation = $1, appeal_until = $2 WHERE post_id = $3 AND source = $4 AND restored_at IS NULL",
            [note, now + APPEAL_MS, post.id, sourceTag]
          )
        }
      }
      if (post && verdict === "rejected" && post.removed_at !== null) {
        const ids = await threadIds(tx, post.id)
        await tx.unsafe("UPDATE posts SET removed_at = NULL WHERE removed_at = $1 AND id = ANY($2::text[])", [post.removed_at, ids])
        await tx.unsafe("UPDATE moderation_notices SET restored_at = $1 WHERE post_id = $2 AND source = $3 AND restored_at IS NULL", [
          now,
          post.id,
          sourceTag,
        ])
      }
    })
  } catch (error) {
    fail(`The decision was not saved: ${error.message}. Nothing changed. Run this again.`)
  }

  const about = (KINDS[notice.kind] ?? "content").toLowerCase()
  const lines =
    verdict === "actioned"
      ? [
          `We looked at your notice about ${about} and took action.`,
          "",
          `What we did: ${post ? "the content you named was hidden from Rhenko. Its author has been told why and can appeal." : "the content you named was actioned."}`,
          `Why: ${note}`,
        ]
      : [`We looked at your notice about ${about} and did not take action.`, "", `Why: ${note}`]
  lines.push("", `Reference: ${notice.id}`, "", "If you think we got this wrong, reply to this email and say why. A person will read your reply.")
  const sent = await emailSender(notice.email, `Decision on your notice (${notice.id.slice(0, 8)})`, lines.join("\n"))

  console.log(`Recorded the decision on notice ${notice.id}: ${verdict}.`)
  if (post && verdict === "actioned") console.log(post.removed_at === null ? "The post is hidden now." : "The post was already hidden, and its author now sees this reason.")
  if (post && verdict === "rejected") console.log("A post hidden for this notice is back.")
  if (sent) console.log("The sender has been emailed.")
}

async function recordRequest() {
  const summary = (options.summary ?? "").replace(/\r\n/g, "\n").trim()
  if ([...summary].length < 10) fail("Describe the request in at least 10 characters: who sent it, what it asks for, and the legal basis.")
  if ([...summary].length > 2000) fail("Keep the description under 2,000 characters.")
  const id = randomUUID()
  await sql.unsafe(
    `INSERT INTO legal_notices (id, kind, name, email, description, signature, status, created_at, decided_at)
     VALUES ($1, $2, 'Order or request from an authority', '', $3, 'Recorded by the operator', 'recorded', $4, $5)`,
    [id, REQUEST_KIND, summary, Date.now(), Date.now()]
  )
  console.log(`Recorded request ${id}. It counts in the transparency figures.`)
}

// Counter-notices (17 U.S.C. 512(g)). The author of a post removed for copyright may send one. The owner gets it in full, and the
// post goes back 10 to 14 business days after it arrived, unless the owner says it has started a court action.
async function counterFor(value) {
  const complaint = await findNotice(value)
  if (complaint.kind !== "copyright") fail("Only a copyright notice can have a counter-notice.")
  const counter = await one(
    sql,
    `SELECT c.id, c.restore_from, c.restore_by, c.court_action_at, c.restored_at, n.id AS notice_id, n.post_id
       FROM counter_notices c JOIN moderation_notices n ON n.id = c.notice_id
      WHERE n.source = $1`,
    `legal:${complaint.id}`
  )
  if (!counter) fail(`No counter-notice has been sent for notice ${complaint.id}.`)
  return { complaint, counter }
}

function counterStatus(row, now) {
  if (row.court_action_at !== null) return `court action started on ${when(row.court_action_at)}. The post stays hidden.`
  if (now < row.restore_from) return `waiting. The post can go back no sooner than ${when(row.restore_from)}.`
  if (now < row.restore_by) return `due. Put it back now, no later than ${when(row.restore_by)}, unless a court action has started.`
  return `overdue. The window closed ${when(row.restore_by)}. Put it back now, unless a court action has started.`
}

async function counterList() {
  const now = Date.now()
  const rows = await sql.unsafe(
    `SELECT c.id, c.created_at, c.restore_from, c.restore_by, c.forwarded_at, c.court_action_at, c.name, c.phone,
            c.removed_location, l.id AS complaint_id, l.email AS complaint_email
       FROM counter_notices c
       JOIN moderation_notices n ON n.id = c.notice_id
       LEFT JOIN legal_notices l ON l.id = substr(n.source, 7)
      WHERE c.restored_at IS NULL
      ORDER BY c.restore_by ASC, c.id ASC`
  )
  if (rows.length === 0) {
    console.log("No counter-notice is waiting for a decision.")
    return
  }
  for (const row of rows) {
    console.log("")
    console.log(field("Notice", row.complaint_id ?? "(copyright notice not found)"))
    console.log(field("Counter", `${row.id}, sent ${when(row.created_at)}`))
    console.log(field("From", `${row.name}, tel ${row.phone}`))
    console.log(field("Removed", row.removed_location))
    console.log(field("Status", counterStatus(row, now)))
    if (row.forwarded_at === null) console.log(field("Owner", `Not sent yet to ${row.complaint_email ?? "the owner"}. Send it by hand.`))
  }
  console.log("")
  console.log("Owner has started a court action:  node scripts/legal.mjs court-action <noticeId>")
  console.log("Put a post back:                   node scripts/legal.mjs counter-restore <noticeId>")
}

async function courtAction() {
  const { complaint, counter } = await counterFor(params[0])
  if (counter.restored_at !== null) fail(`That post was already put back on ${when(counter.restored_at)}, so there is nothing to keep hidden.`)
  if (counter.court_action_at !== null) fail(`A court action was already recorded on ${when(counter.court_action_at)}.`)
  await sql.unsafe("UPDATE counter_notices SET court_action_at = $1 WHERE id = $2", [Date.now(), counter.id])
  console.log(`Recorded that the copyright owner has started a court action for notice ${complaint.id}.`)
  console.log("The post stays hidden while the court decides.")
}

async function counterRestore() {
  const { complaint, counter } = await counterFor(params[0])
  if (counter.restored_at !== null) fail(`That post was already put back on ${when(counter.restored_at)}.`)
  if (counter.court_action_at !== null) fail("The copyright owner has started a court action, so the post stays hidden. Do not put it back.")
  const now = Date.now()
  if (now < counter.restore_from) fail(`Too early. The post can go back no sooner than ${when(counter.restore_from)}.`)
  const post = counter.post_id ? await one(sql, "SELECT id, removed_at FROM posts WHERE id = $1", counter.post_id) : null
  const other = await one(
    sql,
    "SELECT COUNT(*) AS count FROM moderation_notices WHERE post_id = $1 AND id <> $2 AND restored_at IS NULL",
    counter.post_id,
    counter.notice_id
  )
  if (Number(other.count) > 0) fail("Another notice still hides this post, so it stays hidden. Decide that notice first.")

  await sql.begin(async (tx) => {
    if (post && post.removed_at !== null) {
      const ids = await threadIds(tx, post.id)
      await tx.unsafe("UPDATE posts SET removed_at = NULL WHERE removed_at = $1 AND id = ANY($2::text[])", [post.removed_at, ids])
    }
    await tx.unsafe("UPDATE moderation_notices SET restored_at = $1 WHERE id = $2", [now, counter.notice_id])
    await tx.unsafe("UPDATE counter_notices SET restored_at = $1 WHERE id = $2", [now, counter.id])
  })

  console.log(`Put the post back for notice ${complaint.id}.${post ? "" : " The post no longer exists, so there was nothing to show again."}`)
  if (now >= counter.restore_by) console.log(`Note: the window closed ${when(counter.restore_by)}. Keep this date in your records.`)
}

async function overdue() {
  const now = Date.now()
  const rows = await sql.unsafe(
    `SELECT id, name, email, post_id, due_by FROM legal_notices
      WHERE status = 'open' AND kind = 'intimate_image' AND due_by IS NOT NULL AND due_by < $1
      ORDER BY due_by ASC, id ASC`,
    [now]
  )
  if (rows.length === 0) {
    console.log("No intimate-image notice is past its 48-hour deadline.")
    return
  }
  console.log(`${rows.length} intimate-image ${rows.length === 1 ? "notice is" : "notices are"} past the 48-hour deadline and still open.`)
  for (const row of rows) {
    const hours = Math.floor((now - row.due_by) / (60 * 60 * 1000))
    console.log("")
    console.log(field("Notice", row.id))
    console.log(field("From", `${row.name} <${row.email}>`))
    console.log(field("Due", `${when(row.due_by)}, ${hours} hours ago`))
    if (row.post_id) console.log(field("Post", row.post_id))
  }
  console.log("")
  console.log('Decide each one now: node scripts/legal.mjs decide <noticeId> actioned|rejected --note "<reason>"')
}

try {
  // The legal tables, and the counter-notice table and deadline columns, come from the current schema. An older database has to
  // be brought up to date first.
  const [{ found }] = await sql.unsafe(
    `SELECT (to_regclass('counter_notices') IS NOT NULL
             AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'legal_notices' AND column_name = 'due_by')) AS found`
  )
  if (!found) {
    fail("This database has not been upgraded for the current version yet. Apply db/postgres/upgrades/2026-11-dmca.sql, then run this again.")
  }

  const commands = {
    list,
    show,
    decide,
    "record-request": recordRequest,
    "counter-list": counterList,
    "court-action": courtAction,
    "counter-restore": counterRestore,
    overdue,
  }
  await commands[command]()
} finally {
  await sql.end()
}
