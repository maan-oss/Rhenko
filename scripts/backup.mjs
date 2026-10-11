// Backs up the database, the server key and the uploaded files.
//
//   node scripts/backup.mjs
//
// Writes one folder named rhenko-<UTC time> into RHENKO_BACKUP_DIR (default ./backups):
//   rhenko.sqlite   a consistent copy of the database, made with VACUUM INTO while the app keeps running
//   secret.key      the server key, when the app keeps it in the data folder (not when RHENKO_SECRET is set)
//   uploads/        a copy of the uploaded files
// The newest 14 backups are kept and older ones are removed. RHENKO_DATA_DIR is read the way the app reads it.
//
// Uploaded files never change once they are written, so a file that is already in the previous backup
// is hard linked instead of copied again. A backup on the same disk as the data does not survive losing
// that disk, so copy the backup folder somewhere else as well. It holds everything needed to read the data.
//
// To restore: stop the app. Copy rhenko.sqlite and secret.key from a backup folder into the data folder, delete
// rhenko.sqlite-wal and rhenko.sqlite-shm there if they exist, copy uploads/ into the data folder, then start the app.
import fs from "node:fs"
import path from "node:path"

// node:sqlite prints a warning that it is experimental. This hides that one warning and keeps every other.
const emitWarning = process.emitWarning
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type
  if (type === "ExperimentalWarning" && String(warning).includes("SQLite")) return
  return emitWarning.call(process, warning, ...rest)
}
const { DatabaseSync } = await import("node:sqlite")

const KEEP = 14
const BACKUP_NAME = /^rhenko-\d{8}T\d{6}Z$/
const STALE_PARTIAL_MS = 24 * 60 * 60 * 1000
// SQLite result codes for a file that is damaged: SQLITE_CORRUPT and SQLITE_NOTADB.
const DAMAGED = new Set([11, 26])

const dataDir = path.resolve(process.env.RHENKO_DATA_DIR || path.join(process.cwd(), "data"))
const backupDir = path.resolve(process.env.RHENKO_BACKUP_DIR || path.join(process.cwd(), "backups"))
const databaseFile = path.join(dataDir, "rhenko.sqlite")
const keyFile = path.join(dataDir, "secret.key")
const uploadDir = path.join(dataDir, "uploads")

function fail(message) {
  console.error(message)
  process.exit(1)
}

function inside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`
}

function count(number, noun) {
  return `${number.toLocaleString("en-US")} ${noun}${number === 1 ? "" : "s"}`
}

if (!fs.existsSync(databaseFile)) {
  fail(`There is no database at ${databaseFile}. Run this from the project folder, or set RHENKO_DATA_DIR to the folder that holds rhenko.sqlite.`)
}
if (inside(uploadDir, backupDir)) {
  fail(`RHENKO_BACKUP_DIR (${backupDir}) is inside the uploads folder, so every backup would copy the ones before it. Choose a folder outside ${uploadDir}.`)
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
const name = `rhenko-${stamp}`
const finalDir = path.join(backupDir, name)
const workDir = `${finalDir}.partial`
const lines = []

try {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
} catch (error) {
  fail(`Could not create ${backupDir}: ${error.message}. Set RHENKO_BACKUP_DIR to a folder you can write to.`)
}

// A run that was killed part way leaves a .partial folder behind. Remove the ones that are clearly abandoned.
for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !/^rhenko-\d{8}T\d{6}Z\.partial$/.test(entry.name)) continue
  const folder = path.join(backupDir, entry.name)
  if (Date.now() - fs.statSync(folder).mtimeMs < STALE_PARTIAL_MS) continue
  fs.rmSync(folder, { recursive: true, force: true })
  console.log(`Removed the unfinished backup ${entry.name}.`)
}

if (fs.existsSync(finalDir) || fs.existsSync(workDir)) {
  fail(`A backup named ${name} already exists. Wait a second and run this again.`)
}

// The newest finished backup, whose uploads can be linked to instead of copied.
function previousBackup() {
  const names = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort()
  return names.length > 0 ? path.join(backupDir, names[names.length - 1]) : null
}

function copyDatabase() {
  const copy = path.join(workDir, "rhenko.sqlite")
  const source = new DatabaseSync(databaseFile, { readOnly: true })
  try {
    source.exec("PRAGMA busy_timeout = 5000")
    source.prepare("VACUUM INTO ?").run(copy)
  } finally {
    source.close()
  }
  // Open the copy and check it, so a backup that cannot be restored is found now and not during a restore.
  const check = new DatabaseSync(copy, { readOnly: true })
  try {
    const rows = check.prepare("PRAGMA quick_check").all()
    if (rows.length !== 1 || rows[0].quick_check !== "ok") {
      const problem = new Error(rows.map((row) => row.quick_check).join("; "))
      problem.damaged = true
      throw problem
    }
  } finally {
    check.close()
  }
  lines.push(`Copied the database to ${path.join(finalDir, "rhenko.sqlite")} (${size(fs.statSync(copy).size)}) and checked it: no problems found.`)
}

function copyKey() {
  if (!fs.existsSync(keyFile)) return
  fs.copyFileSync(keyFile, path.join(workDir, "secret.key"))
  fs.chmodSync(path.join(workDir, "secret.key"), 0o600)
  lines.push("Copied the server key, secret.key.")
}

function copyUploads() {
  if (!fs.existsSync(uploadDir)) {
    lines.push("There is no uploads folder, so there are no files to copy.")
    return
  }
  const target = path.join(workDir, "uploads")
  fs.mkdirSync(target)
  const earlier = previousBackup()
  let added = 0
  let reused = 0
  let vanished = 0
  let bytes = 0
  for (const entry of fs.readdirSync(uploadDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const from = path.join(uploadDir, entry.name)
    const to = path.join(target, entry.name)
    try {
      const length = fs.statSync(from).size
      const old = earlier ? path.join(earlier, "uploads", entry.name) : null
      let linked = false
      if (old && fs.existsSync(old) && fs.statSync(old).size === length) {
        try {
          fs.linkSync(old, to)
          linked = true
        } catch {
          // The disk does not allow links here, so the file is copied.
        }
      }
      if (!linked) fs.copyFileSync(from, to)
      if (linked) reused++
      else added++
      bytes += length
    } catch (error) {
      // A file removed while the backup runs, for example a deleted post's photo, is left out.
      if (error.code !== "ENOENT") throw error
      vanished++
    }
  }
  const skipped = vanished > 0 ? ` ${count(vanished, "file")} deleted while the backup ran ${vanished === 1 ? "was" : "were"} left out.` : ""
  lines.push(
    `Backed up ${count(added + reused, "upload")} (${size(bytes)}): ${added.toLocaleString("en-US")} new, ${reused.toLocaleString("en-US")} already in the previous backup.${skipped}`
  )
}

// The database is copied first. A file added after that is simply not referenced by the copy, whereas the other
// order could leave the copy pointing at a file that was never backed up.
try {
  fs.mkdirSync(workDir, { mode: 0o700 })
  copyDatabase()
  copyKey()
  copyUploads()
  fs.renameSync(workDir, finalDir)
} catch (error) {
  fs.rmSync(workDir, { recursive: true, force: true })
  if (error.damaged || DAMAGED.has(error.errcode)) {
    fail(`The database at ${databaseFile} is damaged (${error.message}). Nothing was kept. Restore it from your last backup.`)
  }
  fail(`The backup did not finish: ${error.message}. Nothing was kept. Check the free disk space and that ${backupDir} can be written to, then run this again.`)
}

for (const line of lines) console.log(line)

const finished = fs
  .readdirSync(backupDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && BACKUP_NAME.test(entry.name))
  .map((entry) => entry.name)
  .sort()
  .reverse()
// This run's backup always stays, even if the clock moved backwards and it is not the newest by name.
const keep = new Set([name, ...finished.filter((other) => other !== name)].slice(0, KEEP))
for (const old of finished.filter((other) => !keep.has(other)).reverse()) {
  fs.rmSync(path.join(backupDir, old), { recursive: true, force: true })
  console.log(`Removed the old backup ${old}.`)
}
console.log(`${count(keep.size, "backup")} kept in ${backupDir}.`)
