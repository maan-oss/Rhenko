// Grants or removes the verified badge on one account.
//
//   node scripts/grant-verified.mjs <handle>            grant the badge
//   node scripts/grant-verified.mjs <handle> --revoke   remove the badge
//
// Reads the database the same way the app does: RHENKO_DATA_DIR if set, otherwise
// ./data. The server can keep running, because SQLite's WAL mode lets two processes
// share the file. Badges are not something people can request in the app.
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const revoke = args.includes("--revoke")
const handle = args.find((arg) => !arg.startsWith("--"))?.replace(/^@/, "")

if (!handle) {
  console.error("Usage: node scripts/grant-verified.mjs <handle> [--revoke]")
  process.exit(1)
}

const dataDir = process.env.RHENKO_DATA_DIR ?? path.join(process.cwd(), "data")
const file = path.join(dataDir, "rhenko.sqlite")
if (!fs.existsSync(file)) {
  console.error(`No database at ${file}. Start the app once, or set RHENKO_DATA_DIR.`)
  process.exit(1)
}

const db = new DatabaseSync(file)
try {
  const user = db.prepare("SELECT handle FROM users WHERE handle = ? COLLATE NOCASE").get(handle)
  if (!user) {
    console.error(`No account named @${handle}.`)
    process.exit(1)
  }
  db.prepare("UPDATE users SET verified = ? WHERE handle = ? COLLATE NOCASE").run(revoke ? 0 : 1, handle)
  console.log(`@${user.handle} is ${revoke ? "no longer verified" : "verified"}.`)
} finally {
  db.close()
}
