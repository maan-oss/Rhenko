// Works through notices about content (copyright, intimate images, child abuse, impersonation, privacy, illegal
// content) and records requests from authorities. Each notice gets a decision, and the person who sent it is told.
//
//   node scripts/legal.mjs list                                 open notices, urgent ones first, then oldest first
//   node scripts/legal.mjs show <noticeId>                      everything the notice says
//   node scripts/legal.mjs decide <noticeId> actioned|rejected --note "<reason>"
//                                                               record the decision, email the sender, and change the post
//   node scripts/legal.mjs record-request --summary "<text>"    log an order or request from a court or authority
//
// actioned: the post is hidden (if it is not already) and its author sees the reason and can appeal.
// rejected: a post hidden because of this notice is put back.
// Email goes out over RHENKO_SMTP_URL with RHENKO_MAIL_FROM. Without it, the email is printed so it can be sent by hand.
//
// Reads the database the way the app does: RHENKO_DATA_DIR if set, otherwise ./data. The app can keep running.
import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import nodemailer from "nodemailer"

// node:sqlite prints a warning that it is experimental. This hides that one warning and keeps every other.
const emitWarning = process.emitWarning
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type
  if (type === "ExperimentalWarning" && String(warning).includes("SQLite")) return
  return emitWarning.call(process, warning, ...rest)
}
const { DatabaseSync } = await import("node:sqlite")

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
  node scripts/legal.mjs record-request --summary "<text>"`

const SHAPES = {
  list: { args: 0, options: [] },
  show: { args: 1, options: [] },
  decide: { args: 2, options: ["note"] },
  "record-request": { args: 0, options: ["summary"] },
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

const dataDir = path.resolve(process.env.RHENKO_DATA_DIR || path.join(process.cwd(), "data"))
const databaseFile = path.join(dataDir, "rhenko.sqlite")
if (!fs.existsSync(databaseFile)) {
  fail(`There is no database at ${databaseFile}. Run this from the project folder, or set RHENKO_DATA_DIR to the folder that holds rhenko.sqlite.`)
}
const db = new DatabaseSync(databaseFile)
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
if (!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legal_notices'").get()) {
  fail("This database has not been upgraded for the current version yet. Start the app once, then run this again.")
}

function prefixOf(value, noun) {
  const prefix = String(value).trim().toLowerCase()
  if (!/^[0-9a-f-]{8,36}$/.test(prefix)) {
    fail(`"${plain(value)}" is not a ${noun} id. Copy one from the list, or give at least its first 8 characters.`)
  }
  return prefix
}

function findNotice(value) {
  const prefix = prefixOf(value, "notice")
  const rows = db
    .prepare("SELECT * FROM legal_notices WHERE substr(id, 1, ?) = ? LIMIT 2")
    .all(prefix.length, prefix)
  if (rows.length === 0) fail(`There is no notice whose id starts with ${prefix}.`)
  if (rows.length > 1) fail(`More than one notice starts with ${prefix}. Give more of the id.`)
  return rows[0]
}

// The same thread tree the moderation script uses: the post and every reply under it.
const TREE = `WITH RECURSIVE tree(id) AS (
  SELECT id FROM posts WHERE id = ?
  UNION ALL
  SELECT p.id FROM posts p JOIN tree t ON p.reply_to_id = t.id
)`
function threadIds(postId) {
  return db.prepare(`${TREE} SELECT id FROM tree`).all(postId).map((row) => row.id)
}

function list() {
  const rows = db
    .prepare(
      `SELECT id, kind, name, email, url, post_id, created_at FROM legal_notices
       WHERE status = 'open'
       ORDER BY CASE WHEN kind IN ('intimate_image', 'child_abuse') THEN 0 ELSE 1 END, created_at ASC, id ASC`
    )
    .all()
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
    if (row.post_id) console.log(field("Post", row.post_id))
    else if (row.url) console.log(field("Link", row.url))
  }
  console.log("")
  console.log("Read one with:   node scripts/legal.mjs show <noticeId>")
  console.log("Decide with:     node scripts/legal.mjs decide <noticeId> actioned|rejected --note \"<reason>\"")
}

function show() {
  const notice = findNotice(params[0])
  console.log(field("Notice", notice.id))
  console.log(field("About", `${KINDS[notice.kind] ?? notice.kind}${URGENT.has(notice.kind) ? " (urgent)" : ""}`))
  console.log(field("Status", notice.status === "open" ? "open" : `${notice.status}${notice.decided_at ? `, decided ${when(notice.decided_at)}` : ""}`))
  console.log(field("Sent", when(notice.created_at)))
  console.log(field("From", `${notice.name} <${notice.email}>`))
  if (notice.address) console.log(field("Address", notice.address))
  if (notice.url) console.log(field("Link", notice.url))
  if (notice.work) console.log(field("Work", notice.work))
  console.log(field("Said", notice.description))
  console.log(field("Signed", notice.signature))
  if (notice.post_id) {
    const post = db
      .prepare("SELECT p.id, p.body, p.removed_at, u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?")
      .get(notice.post_id)
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

  const notice = findNotice(params[0])
  if (notice.status !== "open") fail(`That notice was already ${notice.status}.`)
  const now = Date.now()
  const post = notice.post_id ? db.prepare("SELECT id, body, author_id, removed_at FROM posts WHERE id = ?").get(notice.post_id) : null
  const sourceTag = `legal:${notice.id}`

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("UPDATE legal_notices SET status = ?, decision_note = ?, decided_at = ? WHERE id = ?").run(verdict, note, now, notice.id)
    if (post && verdict === "actioned") {
      if (post.removed_at === null) {
        const ids = threadIds(post.id)
        db.prepare(`UPDATE posts SET removed_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`).run(now, ...ids)
        db.prepare(
          `INSERT INTO moderation_notices (id, user_id, post_id, category, explanation, excerpt, source, created_at, appeal_until)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(randomUUID(), post.author_id, post.id, notice.kind, note, excerpt(post.body), sourceTag, now, now + APPEAL_MS)
      } else {
        // Hidden while the notice was open: the author's notice now carries the decision instead of the interim reason.
        db.prepare("UPDATE moderation_notices SET explanation = ?, appeal_until = ? WHERE post_id = ? AND source = ? AND restored_at IS NULL").run(
          note,
          now + APPEAL_MS,
          post.id,
          sourceTag
        )
      }
    }
    if (post && verdict === "rejected" && post.removed_at !== null) {
      const ids = threadIds(post.id)
      db.prepare(`UPDATE posts SET removed_at = NULL WHERE removed_at = ? AND id IN (${ids.map(() => "?").join(",")})`).run(
        post.removed_at,
        ...ids
      )
      db.prepare("UPDATE moderation_notices SET restored_at = ? WHERE post_id = ? AND source = ? AND restored_at IS NULL").run(
        now,
        post.id,
        sourceTag
      )
    }
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
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
      : [
          `We looked at your notice about ${about} and did not take action.`,
          "",
          `Why: ${note}`,
        ]
  lines.push("", `Reference: ${notice.id}`, "", "If you think we got this wrong, reply to this email and say why. A person will read your reply.")
  const sent = await emailSender(notice.email, `Decision on your notice (${notice.id.slice(0, 8)})`, lines.join("\n"))

  console.log(`Recorded the decision on notice ${notice.id}: ${verdict}.`)
  if (post && verdict === "actioned") console.log(post.removed_at === null ? "The post is hidden now." : "The post was already hidden, and its author now sees this reason.")
  if (post && verdict === "rejected") console.log("A post hidden for this notice is back.")
  if (sent) console.log("The sender has been emailed.")
}

function recordRequest() {
  const summary = (options.summary ?? "").replace(/\r\n/g, "\n").trim()
  if ([...summary].length < 10) fail("Describe the request in at least 10 characters: who sent it, what it asks for, and the legal basis.")
  if ([...summary].length > 2000) fail("Keep the description under 2,000 characters.")
  const id = randomUUID()
  db.prepare(
    `INSERT INTO legal_notices (id, kind, name, email, description, signature, status, created_at, decided_at)
     VALUES (?, ?, 'Order or request from an authority', '', ?, 'Recorded by the operator', 'recorded', ?, ?)`
  ).run(id, REQUEST_KIND, summary, Date.now(), Date.now())
  console.log(`Recorded request ${id}. It counts in the transparency figures.`)
}

try {
  if (command === "list") list()
  else if (command === "show") show()
  else if (command === "decide") await decide()
  else recordRequest()
} finally {
  db.close()
}
