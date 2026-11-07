// Reviews reports, hides and restores posts, and decides appeals from the command line.
//
//   node scripts/moderation.mjs list                          open reports, oldest first
//   node scripts/moderation.mjs resolve <reportId>            close a report; nothing is hidden or removed
//   node scripts/moderation.mjs hide <postId> --category <id> --explain "<reason>"
//                                                             hide a post and its replies; the author sees the reason and can appeal
//   node scripts/moderation.mjs restore <postId>              put a hidden post and its replies back
//   node scripts/moderation.mjs appeals                       appeals waiting for a decision, oldest first
//   node scripts/moderation.mjs decide <appealId> reverse|uphold --note "<reason>"
//                                                             reverse puts the post back; uphold deletes it for good
//   node scripts/moderation.mjs remove <postId> [--yes]       delete a post for good at once; no appeal, for emergencies
//   node scripts/moderation.mjs reports                       reports of chat messages still open, oldest first
//   node scripts/moderation.mjs report-open <reportId> --key <file> [--out <dir>]
//                                                             read a chat report with the private key; --out saves its text and files
//   node scripts/moderation.mjs report-close <reportId> actioned|no-action
//                                                             close a chat report that was opened
//   node scripts/moderation.mjs report-ncmec <reportId> --reference <number> [--date YYYY-MM-DD]
//                                                             record that the report was made to NCMEC; kept one year from then
//   node scripts/moderation.mjs chat-hide <messageId> --category <id> --explain "<reason>"
//                                                             take a chat message off the server for everyone, with a record
//   node scripts/moderation.mjs report-keygen <file>          make the key pair for chat reports, once (docs/encrypted-chats.md)
//
// Chat reports are made by someone who reports a message in a chat. The report holds that message and up to four before it, and
// nobody in the chat is told. Each report is sealed to Rhenko's report key before it is stored, so the server holds only ciphertext.
// report-open is the only way to read one, and it needs the private key file, which the server never has. A report and its files
// are kept for one year and then removed by the running app. A report made to NCMEC is kept for one year from the date it was made
// to NCMEC (report-ncmec), as 18 U.S.C. 2258A(h) asks. A report that gives a child-safety or intimate-image reason takes its message
// off the chat at once, and chat-hide does the same for any message a moderator decides about.
//
// Hiding is the normal step. It keeps the post on the server, marks it, and tells the author why. When the 30-day appeal
// window closes with no appeal, or an appeal is upheld, the background pass deletes the post and its files.
//
// remove deletes the post, every reply under it, the likes, bookmarks and open reports that belong to them,
// and their photo and video files. A post that quotes a removed post stays and loses the quote.
// It shows what will go and asks first; --yes skips the question. It cannot be undone, so take a backup first.
// An id can be shortened to its first 8 characters when that picks out one record.
//
// Reads and writes the database the app uses (DATABASE_URL). The app can keep running. The photo and video files that
// remove deletes are queued in pending_file_deletions, and the running app deletes them from its storage (R2 in production,
// the disk in development), so this command needs no access to the storage itself.
import readline from "node:readline/promises"
import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import postgres from "postgres"

// These mirror lib/legal.ts. The e2e suite checks that they still match.
const CATEGORIES = {
  child_abuse: "Child sexual abuse material",
  intimate_image: "Intimate image shared without consent",
  illegal: "Illegal content",
  copyright: "Copyright infringement",
  impersonation: "Impersonation",
  privacy: "Private information shared without consent",
  harassment: "Harassment or abuse",
  hate: "Hateful conduct",
  violence: "Violent or threatening content",
  spam: "Spam or manipulation",
  rules: "Breaks our Rules",
}
const APPEAL_MS = 30 * 24 * 60 * 60 * 1000
const EXCERPT_CHARS = 140

const UPLOAD_NAME = /^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm|mov)$/
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/
// The stored name the app gives a file: 32 hex digits and an extension.
const SAFE_FILE = /^[a-f0-9]{32}\.[a-z0-9]{1,5}$/
const USAGE = `Usage:
  node scripts/moderation.mjs list
  node scripts/moderation.mjs resolve <reportId>
  node scripts/moderation.mjs hide <postId> --category <id> --explain "<reason>"
  node scripts/moderation.mjs restore <postId>
  node scripts/moderation.mjs appeals
  node scripts/moderation.mjs decide <appealId> reverse|uphold --note "<reason>"
  node scripts/moderation.mjs remove <postId> [--yes]
  node scripts/moderation.mjs reports
  node scripts/moderation.mjs report-open <reportId> --key <file> [--out <dir>]
  node scripts/moderation.mjs report-close <reportId> actioned|no-action
  node scripts/moderation.mjs report-ncmec <reportId> --reference <number> [--date YYYY-MM-DD]
  node scripts/moderation.mjs chat-hide <messageId> --category <id> --explain "<reason>"
  node scripts/moderation.mjs report-keygen <file>

Categories: ${Object.keys(CATEGORIES).join(", ")}`

// Which arguments and options each command takes.
const SHAPES = {
  list: { args: 0, options: [] },
  resolve: { args: 1, options: [] },
  hide: { args: 1, options: ["category", "explain"] },
  restore: { args: 1, options: [] },
  appeals: { args: 0, options: [] },
  decide: { args: 2, options: ["note"] },
  remove: { args: 1, options: ["yes"] },
  reports: { args: 0, options: [] },
  "report-open": { args: 1, options: ["key", "out"] },
  "report-close": { args: 2, options: [] },
  "report-ncmec": { args: 1, options: ["reference", "date"] },
  "chat-hide": { args: 1, options: ["category", "explain"] },
  "report-keygen": { args: 1, options: [] },
}
const VALUE_OPTIONS = new Set(["category", "explain", "note", "key", "out", "reference", "date"])

function fail(message) {
  console.error(message)
  process.exit(1)
}

// Text from the database is written by other people. Control characters could move the cursor or rewrite
// earlier lines in a terminal, and bidirectional marks could reorder what is shown, so they are shown as escapes.
function plain(text) {
  return String(text).replace(
    /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
  )
}

function when(ms) {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`
}

function count(number, noun, plural = `${noun}s`) {
  return `${number.toLocaleString("en-US")} ${number === 1 ? noun : plural}`
}

function andList(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

// Text laid out under a label, with later lines lined up beneath the first.
function field(label, text) {
  const indent = " ".repeat(9)
  const lines = plain(text).split("\n")
  return `${label.padEnd(9)}${lines.join(`\n${indent}`)}`
}

function excerpt(body) {
  const flat = String(body).replace(/\s+/g, " ").trim()
  const chars = [...flat]
  return chars.length > EXCERPT_CHARS ? `${chars.slice(0, EXCERPT_CHARS).join("")}…` : flat
}

// Parses "--name value", "--name=value" and the bare flag --yes. Anything else starting with a dash is an error.
const argv = process.argv.slice(2)
const options = {}
const positional = []
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  const flag = /^--([a-z]+)(?:=(.*))?$/s.exec(arg)
  if (!flag) {
    if (arg.startsWith("-")) fail(USAGE)
    positional.push(arg)
    continue
  }
  const [, name, inline] = flag
  if (name === "yes") {
    if (inline !== undefined) fail(USAGE)
    options.yes = true
    continue
  }
  if (!VALUE_OPTIONS.has(name)) fail(USAGE)
  const value = inline ?? argv[++i]
  if (value === undefined) fail(`--${name} needs a value.`)
  options[name] = value
}
const [command, ...params] = positional
const shape = Object.hasOwn(SHAPES, command) ? SHAPES[command] : null
if (!shape || params.length !== shape.args) fail(USAGE)
if (Object.keys(options).some((name) => !shape.options.includes(name))) fail(USAGE)

// Making the key pair needs no database, so it runs before the connection is opened.
if (command === "report-keygen") {
  await keygen(params[0])
  process.exit(0)
}

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

async function hasColumn(table, column) {
  const row = await one(sql, "SELECT 1 AS found FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2", table, column)
  return row !== undefined
}

// An id as typed: the whole id or its first characters, which must match exactly one record.
function idPrefix(value, noun) {
  const prefix = String(value).trim().toLowerCase()
  if (!/^[0-9a-f-]{8,36}$/.test(prefix)) {
    fail(`"${plain(value)}" is not a ${noun} id. Copy one from the list, or give at least its first 8 characters.`)
  }
  return prefix
}

function onlyMatch(rows, noun, prefix) {
  if (rows.length === 0) fail(`There is no ${noun} whose id starts with ${prefix}.`)
  if (rows.length > 1) fail(`More than one ${noun} starts with ${prefix}. Give more of the id.`)
  return rows[0]
}

async function findReport(value) {
  const prefix = idPrefix(value, "report")
  const rows = await sql.unsafe("SELECT id, resolved_at FROM reports WHERE substr(id, 1, $1) = $2 LIMIT 2", [prefix.length, prefix])
  return onlyMatch(rows, "report", prefix)
}

async function findPost(value) {
  const prefix = idPrefix(value, "post")
  const rows = await sql.unsafe(
    `SELECT p.id, p.body, p.created_at, p.author_id, p.removed_at, u.handle AS author
     FROM posts p JOIN users u ON u.id = p.author_id WHERE substr(p.id, 1, $1) = $2 LIMIT 2`,
    [prefix.length, prefix]
  )
  return onlyMatch(rows, "post", prefix)
}

// The post and every reply under it at any depth. Quotes are not part of the tree: they stay visible.
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
    `SELECT r.id, r.reason, r.created_at, r.post_id, reporter.handle AS reporter,
            p.body AS body, author.handle AS author, account.handle AS account
     FROM reports r
     JOIN users reporter ON reporter.id = r.reporter_id
     LEFT JOIN posts p ON p.id = r.post_id
     LEFT JOIN users author ON author.id = p.author_id
     LEFT JOIN users account ON account.id = r.user_id
     WHERE r.resolved_at IS NULL
     ORDER BY r.created_at ASC, r.id ASC`
  )
  if (rows.length === 0) {
    console.log("No open reports.")
    return
  }
  console.log(`${count(rows.length, "open report")}, oldest first.`)
  for (const row of rows) {
    console.log("")
    console.log(field("Report", row.id))
    console.log(field("Filed", `${when(row.created_at)} by @${row.reporter}`))
    console.log(field("Reason", row.reason))
    if (row.post_id) {
      console.log(field("Post", `${row.post_id} by @${row.author}`))
      console.log(field("Text", row.body))
    } else if (row.account) {
      console.log(field("Account", `@${row.account}`))
    }
  }
  console.log("")
  console.log("Close a report with:  node scripts/moderation.mjs resolve <reportId>")
  console.log("Hide a post with:     node scripts/moderation.mjs hide <postId> --category <id> --explain \"<reason>\"")
  console.log("Delete a post with:   node scripts/moderation.mjs remove <postId>")
}

async function resolve() {
  const report = await findReport(params[0])
  if (report.resolved_at !== null) {
    console.log(`Report ${report.id} was already resolved on ${when(report.resolved_at)}.`)
    return
  }
  const now = Date.now()
  await sql.unsafe("UPDATE reports SET resolved_at = $1, outcome = 'no_action', outcome_at = $2 WHERE id = $3 AND resolved_at IS NULL", [now, now, report.id])
  console.log(`Resolved report ${report.id}. Nothing was hidden or removed.`)
}

async function hide() {
  const category = options.category ?? ""
  if (!Object.hasOwn(CATEGORIES, category)) fail(`Give a category: ${Object.keys(CATEGORIES).join(", ")}.`)
  const explain = (options.explain ?? "").replace(/\r\n/g, "\n").trim()
  if ([...explain].length < 10) fail("Explain why in at least 10 characters. The author reads this.")
  if ([...explain].length > 500) fail("Keep the explanation under 500 characters.")

  const post = await findPost(params[0])
  if (post.removed_at !== null) {
    fail(`That post is already hidden. Put it back with: node scripts/moderation.mjs restore ${post.id.slice(0, 8)}`)
  }
  const ids = await threadIds(sql, post.id)
  const now = Date.now()
  const noticeId = randomUUID()
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("UPDATE posts SET removed_at = $1 WHERE id = ANY($2::text[])", [now, ids])
      await tx.unsafe(
        "UPDATE reports SET resolved_at = $1, outcome = 'hidden', outcome_at = $2 WHERE post_id = $3 AND resolved_at IS NULL",
        [now, now, post.id]
      )
      await tx.unsafe(
        `INSERT INTO moderation_notices (id, user_id, post_id, category, explanation, excerpt, source, created_at, appeal_until)
         VALUES ($1, $2, $3, $4, $5, $6, 'moderator', $7, $8)`,
        [noticeId, post.author_id, post.id, category, explain, excerpt(post.body), now, now + APPEAL_MS]
      )
    })
  } catch (error) {
    fail(`The post was not hidden: ${error.message}. Nothing changed. Run this again.`)
  }
  console.log(`Hid ${count(ids.length, "post")} by @${post.author} (${CATEGORIES[category]}).`)
  console.log(`Notice ${noticeId}. The author can appeal within 30 days; after that, or if the appeal fails, the post is deleted.`)
}

// Puts back the hidden posts of a thread and returns how many. A person has looked at a post and put it back, so the
// automatic hold or limit from screening no longer applies to it: the feeds leave out every post whose risk action is not
// 'allow' (NOT_RESTRICTED in lib/data.ts), so without this a restored post would stay out of the feeds.
async function restoreThread(conn, postId, removedAt, now) {
  const ids = await threadIds(conn, postId)
  const restored = await conn.unsafe("UPDATE posts SET removed_at = NULL WHERE removed_at = $1 AND id = ANY($2::text[]) RETURNING id", [removedAt, ids])
  const restoredIds = restored.map((row) => row.id)
  if (restoredIds.length > 0) {
    await conn.unsafe("UPDATE moderation_notices SET restored_at = $1 WHERE post_id = $2 AND restored_at IS NULL", [now, postId])
    await conn.unsafe("UPDATE post_risk SET action = 'allow' WHERE post_id = ANY($1::text[])", [restoredIds])
  }
  return restoredIds.length
}

async function restore() {
  const post = await findPost(params[0])
  if (post.removed_at === null) fail("That post is not hidden.")
  const now = Date.now()
  let restored = 0
  try {
    await sql.begin(async (tx) => {
      restored = await restoreThread(tx, post.id, post.removed_at, now)
    })
  } catch (error) {
    fail(`The post was not put back: ${error.message}. Nothing changed. Run this again.`)
  }
  console.log(`Put back ${count(restored, "post")} by @${post.author}.`)
}

async function appeals() {
  const rows = await sql.unsafe(
    `SELECT a.id, a.reason, a.created_at, n.category, n.explanation, n.excerpt, n.created_at AS notice_at,
            n.restored_at, u.handle AS account
     FROM appeals a
     JOIN moderation_notices n ON n.id = a.notice_id
     JOIN users u ON u.id = a.user_id
     WHERE a.decided_at IS NULL
     ORDER BY a.created_at ASC, a.id ASC`
  )
  if (rows.length === 0) {
    console.log("No appeals waiting for a decision.")
    return
  }
  console.log(`${count(rows.length, "appeal")} waiting, oldest first.`)
  for (const row of rows) {
    console.log("")
    console.log(field("Appeal", row.id))
    console.log(field("Account", `@${row.account}, appealed ${when(row.created_at)}`))
    console.log(field("Notice", `${CATEGORIES[row.category] ?? row.category}, sent ${when(row.notice_at)}`))
    console.log(field("Reason", row.explanation))
    console.log(field("Post", row.excerpt || "(no text kept)"))
    console.log(field("Appeal", row.reason))
  }
  console.log("")
  console.log("Decide with: node scripts/moderation.mjs decide <appealId> reverse|uphold --note \"<reason>\"")
}

async function decide() {
  const verdict = params[1]
  if (verdict !== "reverse" && verdict !== "uphold") fail("Say reverse or uphold.")
  const note = (options.note ?? "").replace(/\r\n/g, "\n").trim()
  if ([...note].length < 10) fail("Write the reason in at least 10 characters. The author reads this.")
  if ([...note].length > 1000) fail("Keep the reason under 1,000 characters.")

  const prefix = idPrefix(params[0], "appeal")
  const appealRows = await sql.unsafe("SELECT id, notice_id, decided_at FROM appeals WHERE substr(id, 1, $1) = $2 LIMIT 2", [prefix.length, prefix])
  const appeal = onlyMatch(appealRows, "appeal", prefix)
  if (appeal.decided_at !== null) fail("That appeal was already decided.")
  const notice = await one(sql, "SELECT post_id FROM moderation_notices WHERE id = $1", appeal.notice_id)
  const decision = verdict === "reverse" ? "reversed" : "upheld"
  const now = Date.now()
  let restored = 0
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("UPDATE appeals SET decided_at = $1, decision = $2, decision_note = $3 WHERE id = $4", [now, decision, note, appeal.id])
      if (decision === "reversed" && notice) {
        const post = await one(tx, "SELECT removed_at FROM posts WHERE id = $1", notice.post_id)
        if (post && post.removed_at !== null) restored = await restoreThread(tx, notice.post_id, post.removed_at, now)
        // The post may already be back, put there by hand. The reversal still lifts the screening hold on it.
        else if (post) await tx.unsafe("UPDATE post_risk SET action = 'allow' WHERE post_id = ANY($1::text[])", [await threadIds(tx, notice.post_id)])
      }
    })
  } catch (error) {
    fail(`The decision was not saved: ${error.message}. Nothing changed. Run this again.`)
  }
  if (decision === "reversed") {
    console.log(restored > 0 ? `Reversed. Put back ${count(restored, "post")}.` : "Reversed. The post was already back, so nothing changed on the page.")
  } else {
    console.log("Upheld. The post will be deleted the next time the background pass runs, within about 15 seconds.")
  }
}

// The post, every reply under it at any depth, the files they use and what else goes with them.
async function inventory(postId) {
  const [totals] = await sql.unsafe(
    `${TREE}
     SELECT
       (SELECT COUNT(*) FROM tree) AS posts,
       (SELECT COUNT(*) FROM posts q WHERE q.quote_of_id IN (SELECT id FROM tree) AND q.id NOT IN (SELECT id FROM tree)) AS quotes,
       (SELECT COUNT(*) FROM reports r WHERE r.post_id IN (SELECT id FROM tree) AND r.resolved_at IS NULL) AS reports`,
    [postId]
  )
  const fileRows = await sql.unsafe(
    `${TREE}
     SELECT file FROM post_media WHERE post_id IN (SELECT id FROM tree)
     UNION
     SELECT media_file FROM posts WHERE id IN (SELECT id FROM tree) AND media_file IS NOT NULL`,
    [postId]
  )
  return { ...totals, files: fileRows.map((row) => row.file) }
}

async function stillUsed(file) {
  const rows = await sql.unsafe(
    `SELECT 1 AS used FROM post_media WHERE file = $1
     UNION ALL SELECT 1 FROM posts WHERE media_file = $1
     UNION ALL SELECT 1 FROM users WHERE avatar_file = $1 OR banner_file = $1
     UNION ALL SELECT 1 FROM chat_messages WHERE media_file = $1
     UNION ALL SELECT 1 FROM chat_report_files WHERE file = $1
     UNION ALL SELECT 1 FROM link_previews WHERE image_file = $1
     UNION ALL SELECT 1 FROM ad_campaigns WHERE picture_file = $1
     LIMIT 1`,
    [file]
  )
  return rows.length > 0
}

async function confirmed() {
  if (options.yes) return true
  if (!process.stdin.isTTY) {
    fail("This needs an answer from a person. Run it in a terminal and confirm there, or add --yes.")
  }
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await terminal.question("Remove it? This cannot be undone. Type yes to confirm: ")
  terminal.close()
  return answer.trim().toLowerCase() === "yes"
}

async function remove() {
  const post = await findPost(params[0])
  const found = await inventory(post.id)
  console.log(field("Post", `${post.id} by @${post.author}, posted ${when(post.created_at)}`))
  console.log(field("Text", post.body))
  // What leaves the database with the post, then the files that go with it.
  const rows = [
    "the post",
    found.posts > 1 ? count(found.posts - 1, "reply", "replies") : null,
    found.reports > 0 ? count(found.reports, "open report") : null,
  ].filter(Boolean)
  const withFiles = found.files.length > 0 ? [...rows, count(found.files.length, "photo or video file")] : rows
  console.log(`This removes ${andList(withFiles)}.`)
  if (found.quotes > 0) {
    console.log(`${count(found.quotes, "other post")} that quote${found.quotes === 1 ? "s" : ""} it will stay and lose the quote.`)
  }
  if (!(await confirmed())) {
    console.log("Nothing was removed.")
    return
  }

  try {
    await sql.unsafe("DELETE FROM posts WHERE id = $1", [post.id])
  } catch (error) {
    fail(`The post was not removed: ${error.message}. Nothing changed. Run this again.`)
  }
  console.log(`Removed ${andList(rows)} from the database.`)

  // The rows are gone. A file that nothing else points at is queued, and the running app deletes it from storage, with its
  // size variants, within about 15 seconds. The app checks again before it deletes, so a file that is used later is kept.
  let queued = 0
  let shared = 0
  for (const file of found.files) {
    if (!UPLOAD_NAME.test(file)) {
      console.log(`Left a file alone because its name is not one the app creates: ${plain(file)}`)
      continue
    }
    if (await stillUsed(file)) {
      shared++
      continue
    }
    await sql.unsafe("INSERT INTO pending_file_deletions (name, created_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING", [file, Date.now()])
    queued++
  }
  if (found.files.length > 0) {
    const notes = shared > 0 ? [`${shared.toLocaleString("en-US")} kept because another record still uses ${shared === 1 ? "it" : "them"}`] : []
    console.log(`Queued ${count(queued, "file")} for deletion. The server removes them within about 15 seconds${notes.length > 0 ? ` (${notes.join("; ")})` : ""}.`)
  }
}

// Chat reports. Each one is sealed to the report key (lib/chat-reports.ts). The server holds the public half only; the private key
// is a file the operator keeps, and report-open is the only way to read a report. The library files are loaded here, not at the top,
// so the rest of this command runs without them.
async function keygen(file) {
  if (!file) fail(USAGE)
  const { reportKeyId } = await import("../lib/chat-reports.ts")
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey)
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey)
  const publicPart = { kty: "EC", crv: "P-256", x: publicJwk.x, y: publicJwk.y }
  const kid = await reportKeyId(publicPart)
  try {
    writeFileSync(file, `${JSON.stringify(privateJwk, null, 2)}\n`, { flag: "wx", mode: 0o600 })
  } catch (error) {
    if (error.code === "EEXIST") fail(`${file} already exists. Choose another name; overwriting a key would lose the reports sealed to it.`)
    throw error
  }
  console.log(`Wrote the private key to ${file}. Keep it outside the server and outside the repository. Whoever holds it can read every reported message.`)
  console.log(`Key id: ${kid}`)
  console.log("Put this line in the server's .env, then restart the app:")
  console.log(`RHENKO_REPORT_KEY='${JSON.stringify(publicPart)}'`)
}

async function findChatReport(value) {
  const prefix = idPrefix(value, "chat report")
  const rows = await sql.unsafe(
    `SELECT r.*, reporter.handle AS reporter, reported.handle AS sender
     FROM chat_reports r
     LEFT JOIN users reporter ON reporter.id = r.reporter_id
     LEFT JOIN users reported ON reported.id = r.reported_user_id
     WHERE substr(r.id, 1, $1) = $2 LIMIT 2`,
    [prefix.length, prefix]
  )
  return onlyMatch(rows, "chat report", prefix)
}

async function chatReports() {
  const rows = await sql.unsafe(
    `SELECT r.id, r.reason, r.created_at, r.retain_until, r.opened_at, r.conversation_id, r.message_id,
            r.ncmec_reference, r.ncmec_reported_at, reporter.handle AS reporter, reported.handle AS sender
     FROM chat_reports r
     LEFT JOIN users reporter ON reporter.id = r.reporter_id
     LEFT JOIN users reported ON reported.id = r.reported_user_id
     WHERE r.status = 'open'
     ORDER BY r.created_at ASC, r.id ASC`
  )
  if (rows.length === 0) {
    console.log("No chat reports open.")
    return
  }
  console.log(`${count(rows.length, "chat report")} open, oldest first. The text is not shown here.`)
  for (const row of rows) {
    console.log("")
    console.log(field("Report", row.id))
    console.log(field("Filed", `${when(row.created_at)} by @${row.reporter ?? "(deleted account)"}`))
    console.log(field("Reason", row.reason))
    console.log(field("Sender", `@${row.sender ?? "(deleted account)"}`))
    console.log(field("Opened", row.opened_at === null ? "not yet" : when(row.opened_at)))
    console.log(field("Keep to", when(row.retain_until)))
    if (row.ncmec_reference) console.log(field("NCMEC", `${row.ncmec_reference}, made ${when(Number(row.ncmec_reported_at))}`))
  }
  console.log("")
  console.log("Open one with: npm run moderation -- report-open <reportId> --key <file> [--out <dir>]")
}

// Reads a chat report with the private key. The text is printed; --out also saves it, with its files, to a directory. Opening it
// records when it was first opened, which is the start of the review.
async function chatReportOpen() {
  if (!options.key) fail("Give the private key file with --key.")
  const row = await findChatReport(params[0])
  let privateJwk
  try {
    privateJwk = JSON.parse(readFileSync(options.key, "utf8"))
  } catch {
    fail(`${options.key} could not be read as a key file.`)
  }
  const { openReport, parseSealedReport, reportContext } = await import("../lib/chat-reports.ts")
  const sealed = parseSealedReport(JSON.parse(row.sealed))
  if (!sealed) fail("This report is damaged and cannot be opened.")
  let payload
  try {
    payload = await openReport(privateJwk, reportContext(row.conversation_id, row.message_id, row.kid), sealed)
  } catch (error) {
    fail(`The report was not opened: ${error.message}`)
  }
  await sql.unsafe("UPDATE chat_reports SET opened_at = COALESCE(opened_at, $1) WHERE id = $2", [Date.now(), row.id])

  console.log(field("Report", row.id))
  console.log(field("Reason", payload.reason))
  console.log(field("Filed", `${when(row.created_at)} by @${row.reporter ?? "(deleted account)"}`))
  console.log(field("Sender", `@${row.sender ?? "(deleted account)"}`))
  console.log(field("Chat", `${row.conversation_id}${payload.conversation.encrypted ? ", end-to-end encrypted" : ""}`))
  console.log(field("Keep to", when(row.retain_until)))
  for (const message of payload.messages) {
    console.log("")
    const mark = message.id === payload.reportedMessageId ? "  (reported)" : ""
    console.log(`${when(message.sentAt)}  @${plain(message.sender.handle)}${mark}`)
    console.log(message.deleted ? "(deleted)" : plain(message.text))
    if (message.media) console.log(`[file: ${plain(message.media.name)}, ${plain(message.media.mime)}]`)
    if (message.attachment) console.log(`[attachment: ${plain(JSON.stringify(message.attachment))}]`)
  }

  if (!options.out) return
  const dir = options.out
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(join(dir, "report.json"), `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  const { readObject } = await import("../lib/storage.ts")
  const { openFile } = await import("../lib/e2ee-media.ts")
  let saved = 0
  for (const message of payload.messages) {
    const media = message.media
    if (!media) continue
    if (!SAFE_NAME.test(message.id) || !SAFE_FILE.test(media.file)) {
      console.log(`Left a file alone because its name is not one the app creates: ${plain(media.file)}`)
      continue
    }
    const stored = await readObject(media.file)
    if (!stored) {
      console.log(`The stored file for the message at ${when(message.sentAt)} is no longer there.`)
      continue
    }
    // An encrypted chat's file is ciphertext, and the report holds the key to open it. A plain chat's file is stored as it is.
    const bytes =
      payload.conversation.encrypted && media.key && media.iv
        ? Buffer.from(await openFile(stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength), media.key, media.iv, payload.conversation.id, message.id))
        : stored
    writeFileSync(join(dir, `${message.id}-${media.file}`), bytes, { mode: 0o600 })
    saved++
  }
  console.log("")
  console.log(`Saved the report and ${count(saved, "file")} to ${plain(dir)}. Those files hold what was reported; keep them where only the review can reach them.`)
}

// Closes a chat report once it was opened. actioned means the report led to action outside this command; no-action means nothing was done.
async function chatReportClose() {
  const outcome = params[1]
  if (outcome !== "actioned" && outcome !== "no-action") fail("Say actioned or no-action.")
  const row = await findChatReport(params[0])
  if (row.status !== "open") fail(`That report was already closed as ${row.status}.`)
  if (row.opened_at === null) fail("Open the report with report-open first, so the review is on record.")
  await sql.unsafe("UPDATE chat_reports SET status = $1, handled_at = $2 WHERE id = $3 AND status = 'open'", [outcome === "actioned" ? "actioned" : "no_action", Date.now(), row.id])
  console.log(`Closed report ${row.id} as ${outcome}. Its record is kept until ${when(row.retain_until)}.`)
}

// Records that a chat report was made to NCMEC. The statute asks a provider to keep the report for one year after it is submitted
// (18 U.S.C. 2258A(h)), so the report is kept until one year after the date given here, if that is later than its current end.
// The reference is the report number NCMEC's CyberTipline gave. Submitting the report is done outside this command.
async function chatReportNcmec() {
  const reference = (options.reference ?? "").trim()
  if (reference.length < 1 || reference.length > 100) fail("Give the CyberTipline report number with --reference (up to 100 characters).")
  const date = options.date ?? new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("Give the date as YYYY-MM-DD with --date, or leave it out for today.")
  const reportedAt = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(reportedAt)) fail(`"${date}" is not a real date.`)
  if (reportedAt > Date.now() + 24 * 60 * 60 * 1000) fail("The date is in the future. Give the day the report was made.")
  const { CHAT_REPORT_RETENTION_MS } = await import("../lib/chat-reports.ts")
  const row = await findChatReport(params[0])
  if (row.opened_at === null) fail("Open the report with report-open first, so the review is on record.")
  if (row.ncmec_reference) fail(`That report was already made to NCMEC as ${row.ncmec_reference} on ${when(Number(row.ncmec_reported_at))}.`)
  const keepUntil = Math.max(Number(row.retain_until), reportedAt + CHAT_REPORT_RETENTION_MS)
  const updated = await sql.unsafe(
    "UPDATE chat_reports SET ncmec_reference = $1, ncmec_reported_at = $2, retain_until = $3 WHERE id = $4 AND ncmec_reference IS NULL",
    [reference, reportedAt, keepUntil, row.id]
  )
  if (updated.count !== 1) fail("The report was not updated. Someone else may have recorded it. Run reports to check.")
  console.log(`Recorded report ${row.id} as made to NCMEC: ${reference}, on ${date}.`)
  console.log(`It is kept until ${when(keepUntil)}: one year after the date it was made to NCMEC, or the date it was already kept until, whichever is later.`)
}

async function findChatMessage(value) {
  const prefix = idPrefix(value, "message")
  const rows = await sql.unsafe(
    "SELECT id, conversation_id, sender_id, media_file, deleted_at FROM chat_messages WHERE substr(id, 1, $1) = $2 LIMIT 2",
    [prefix.length, prefix]
  )
  return onlyMatch(rows, "message", prefix)
}

// Takes a chat message off the server for everyone, as a moderator decides (lib/chat-moderation.ts). The thread shows it as deleted, and
// nothing of its words, attachment, sealed content or reactions is left on the server. A chat report that kept the message keeps its
// copy for the report's year. A stored file is queued for the running app to delete, unless another message or a report still keeps it.
async function chatHide() {
  const category = options.category ?? ""
  if (!Object.hasOwn(CATEGORIES, category)) fail(`Give a category: ${Object.keys(CATEGORIES).join(", ")}.`)
  const explain = (options.explain ?? "").replace(/\r\n/g, "\n").trim()
  if ([...explain].length < 10) fail("Explain why in at least 10 characters. The record keeps this.")
  if ([...explain].length > 500) fail("Keep the explanation under 500 characters.")

  const message = await findChatMessage(params[0])
  const { clearMessageStatements, removalRecordStatement, numbered } = await import("../lib/chat-moderation.ts")
  const now = Date.now()
  const recordId = randomUUID()
  let queued = false
  try {
    await sql.begin(async (tx) => {
      for (const statement of clearMessageStatements(message.id, now)) {
        await tx.unsafe(numbered(statement.sql), statement.params)
      }
      const record = removalRecordStatement(
        {
          id: recordId,
          messageId: message.id,
          conversationId: message.conversation_id,
          senderId: message.sender_id,
          category,
          explanation: explain,
          source: "moderator",
        },
        now
      )
      await tx.unsafe(numbered(record.sql), record.params)
      const file = message.media_file
      if (file && UPLOAD_NAME.test(file)) {
        const stillKept = await tx.unsafe(
          "SELECT 1 AS used FROM chat_messages WHERE media_file = $1 UNION ALL SELECT 1 FROM chat_report_files WHERE file = $1 LIMIT 1",
          [file]
        )
        if (stillKept.length === 0) {
          await tx.unsafe("INSERT INTO pending_file_deletions (name, created_at) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING", [file, now])
          queued = true
        }
      }
    })
  } catch (error) {
    fail(`The message was not removed: ${error.message}. Nothing changed. Run this again.`)
  }
  console.log(`Took the message off the chat for everyone (${CATEGORIES[category]}).`)
  console.log(`Record ${recordId}. The record is kept for the same period as other moderation records.`)
  if (message.deleted_at !== null) console.log("The sender had already deleted it. The record was still written.")
  if (queued) console.log("Its stored file is queued for deletion. The server removes it within about 15 seconds.")
}

try {
  // The moderation tables and columns are part of the current schema. An older database has to be brought up to date first.
  if (
    !(await hasColumn("reports", "outcome")) ||
    !(await hasColumn("posts", "removed_at")) ||
    !(await hasColumn("moderation_notices", "post_id")) ||
    !(await hasColumn("chat_reports", "sealed")) ||
    !(await hasColumn("chat_reports", "ncmec_reference")) ||
    !(await hasColumn("chat_message_removals", "category"))
  ) {
    fail("This database has not been upgraded for the current version yet. Apply db/postgres/schema.sql, then run this again.")
  }

  if (command === "list") await list()
  else if (command === "resolve") await resolve()
  else if (command === "hide") await hide()
  else if (command === "restore") await restore()
  else if (command === "appeals") await appeals()
  else if (command === "decide") await decide()
  else if (command === "reports") await chatReports()
  else if (command === "report-open") await chatReportOpen()
  else if (command === "report-close") await chatReportClose()
  else if (command === "report-ncmec") await chatReportNcmec()
  else if (command === "chat-hide") await chatHide()
  else await remove()
} finally {
  await sql.end()
}
