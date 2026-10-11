// Reviews reports and removes posts from the command line.
//
//   node scripts/moderation.mjs list                      open reports, oldest first
//   node scripts/moderation.mjs resolve <reportId>        close one report and leave the post as it is
//   node scripts/moderation.mjs remove <postId> [--yes]   delete a post for good
//
// remove deletes the post, every reply under it, the likes, bookmarks and open reports that belong to them,
// and their photo and video files. A post that quotes a removed post stays and loses the quote.
// It shows what will go and asks first; --yes skips the question. It cannot be undone, so take a backup first.
// An id can be shortened to its first 8 characters when that picks out one record.
//
// Reads the database the way the app does: RHENKO_DATA_DIR if set, otherwise ./data. The app can keep running.
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline/promises"

// node:sqlite prints a warning that it is experimental. This hides that one warning and keeps every other.
const emitWarning = process.emitWarning
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type
  if (type === "ExperimentalWarning" && String(warning).includes("SQLite")) return
  return emitWarning.call(process, warning, ...rest)
}
const { DatabaseSync } = await import("node:sqlite")

const UPLOAD_NAME = /^[a-f0-9]{32}\.(jpg|png|webp|gif|mp4|webm|mov)$/
const USAGE = `Usage:
  node scripts/moderation.mjs list
  node scripts/moderation.mjs resolve <reportId>
  node scripts/moderation.mjs remove <postId> [--yes]`

const dataDir = path.resolve(process.env.RHENKO_DATA_DIR || path.join(process.cwd(), "data"))
const databaseFile = path.join(dataDir, "rhenko.sqlite")
const uploadDir = path.join(dataDir, "uploads")

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

const args = process.argv.slice(2)
const flags = args.filter((arg) => arg.startsWith("-"))
const [command, input, ...extra] = args.filter((arg) => !arg.startsWith("-"))
const yes = flags.includes("--yes")

function usageIsValid() {
  if (!flags.every((flag) => flag === "--yes") || extra.length > 0) return false
  if (command === "list") return input === undefined && !yes
  if (command === "resolve") return input !== undefined && !yes
  return command === "remove" && input !== undefined
}
if (!usageIsValid()) fail(USAGE)

if (!fs.existsSync(databaseFile)) {
  fail(`There is no database at ${databaseFile}. Run this from the project folder, or set RHENKO_DATA_DIR to the folder that holds rhenko.sqlite.`)
}
const db = new DatabaseSync(databaseFile)
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
if (!db.prepare("PRAGMA table_info(reports)").all().some((column) => column.name === "resolved_at")) {
  fail("This database has not been upgraded for the current version yet. Start the app once, then run this again.")
}

// An id as typed: the whole id or its first characters, which must match exactly one record.
function idPrefix(noun) {
  const prefix = input.trim().toLowerCase()
  if (!/^[0-9a-f-]{8,36}$/.test(prefix)) {
    fail(`"${plain(input)}" is not a ${noun} id. Copy one from the list, or give at least its first 8 characters.`)
  }
  return prefix
}

function onlyMatch(rows, noun, prefix) {
  if (rows.length === 0) fail(`There is no ${noun} whose id starts with ${prefix}.`)
  if (rows.length > 1) fail(`More than one ${noun} starts with ${prefix}. Give more of the id.`)
  return rows[0]
}

function findReport() {
  const prefix = idPrefix("report")
  return onlyMatch(
    db.prepare("SELECT id, resolved_at FROM reports WHERE substr(id, 1, ?) = ? LIMIT 2").all(prefix.length, prefix),
    "report",
    prefix
  )
}

function findPost() {
  const prefix = idPrefix("post")
  return onlyMatch(
    db
      .prepare(
        `SELECT p.id, p.body, p.created_at, u.handle AS author
         FROM posts p JOIN users u ON u.id = p.author_id WHERE substr(p.id, 1, ?) = ? LIMIT 2`
      )
      .all(prefix.length, prefix),
    "post",
    prefix
  )
}

function list() {
  const rows = db
    .prepare(
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
    .all()
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
  console.log("Close a report with: node scripts/moderation.mjs resolve <reportId>")
  console.log("Delete a post with:  node scripts/moderation.mjs remove <postId>")
}

function resolve() {
  const report = findReport()
  if (report.resolved_at !== null) {
    console.log(`Report ${report.id} was already resolved on ${when(report.resolved_at)}.`)
    return
  }
  db.prepare("UPDATE reports SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL").run(Date.now(), report.id)
  console.log(`Resolved report ${report.id}. Nothing was removed.`)
}

// The post, every reply under it at any depth, the files they use and what else goes with them.
const TREE = `WITH RECURSIVE tree(id) AS (
  SELECT id FROM posts WHERE id = ?
  UNION ALL
  SELECT p.id FROM posts p JOIN tree t ON p.reply_to_id = t.id
)`

function inventory(postId) {
  const totals = db
    .prepare(
      `${TREE}
       SELECT
         (SELECT COUNT(*) FROM tree) AS posts,
         (SELECT COUNT(*) FROM posts q WHERE q.quote_of_id IN (SELECT id FROM tree) AND q.id NOT IN (SELECT id FROM tree)) AS quotes,
         (SELECT COUNT(*) FROM reports r WHERE r.post_id IN (SELECT id FROM tree) AND r.resolved_at IS NULL) AS reports`
    )
    .get(postId)
  const files = db
    .prepare(
      `${TREE}
       SELECT file FROM post_media WHERE post_id IN (SELECT id FROM tree)
       UNION
       SELECT media_file FROM posts WHERE id IN (SELECT id FROM tree) AND media_file IS NOT NULL`
    )
    .all(postId)
    .map((row) => row.file)
  return { ...totals, files }
}

function stillUsed(file) {
  return (
    db
      .prepare(
        `SELECT 1 AS used FROM post_media WHERE file = ?1
         UNION ALL SELECT 1 FROM posts WHERE media_file = ?1
         UNION ALL SELECT 1 FROM users WHERE avatar_file = ?1 OR banner_file = ?1
         UNION ALL SELECT 1 FROM chat_messages WHERE media_file = ?1
         LIMIT 1`
      )
      .get(file) !== undefined
  )
}

async function confirmed() {
  if (yes) return true
  if (!process.stdin.isTTY) {
    fail("This needs an answer from a person. Run it in a terminal and confirm there, or add --yes.")
  }
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await terminal.question("Remove it? This cannot be undone. Type yes to confirm: ")
  terminal.close()
  return answer.trim().toLowerCase() === "yes"
}

async function remove() {
  const post = findPost()
  const found = inventory(post.id)
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

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("DELETE FROM posts WHERE id = ?").run(post.id)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    fail(`The post was not removed: ${error.message}. Nothing changed. Run this again.`)
  }
  console.log(`Removed ${andList(rows)} from the database.`)

  // The rows are gone, so only a file that nothing else points at is deleted.
  let deleted = 0
  let missing = 0
  let shared = 0
  for (const file of found.files) {
    if (!UPLOAD_NAME.test(file)) {
      console.log(`Left a file alone because its name is not one the app creates: ${plain(file)}`)
      continue
    }
    if (stillUsed(file)) {
      shared++
      continue
    }
    try {
      fs.unlinkSync(path.join(uploadDir, file))
      deleted++
    } catch (error) {
      if (error.code === "ENOENT") missing++
      else console.log(`Could not delete ${file}: ${error.message}. Delete it by hand.`)
    }
  }
  if (found.files.length > 0) {
    const notes = [
      missing > 0 ? `${missing.toLocaleString("en-US")} ${missing === 1 ? "was" : "were"} already gone` : null,
      shared > 0 ? `${shared.toLocaleString("en-US")} kept because another record still uses ${shared === 1 ? "it" : "them"}` : null,
    ].filter(Boolean)
    console.log(`Deleted ${count(deleted, "file")}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}.`)
  }
}

try {
  if (command === "list") list()
  else if (command === "resolve") resolve()
  else await remove()
} finally {
  db.close()
}
