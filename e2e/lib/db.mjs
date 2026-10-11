// Direct access to the server's SQLite file, used for exactly one purpose: the scheduled post check.
// The product refuses a schedule less than five minutes ahead, so the check schedules through the page at the
// shortest time the page allows, then moves that one post's time to 30 seconds from now and waits for the server's
// own background loop to publish it. Nothing else in the suite reads or writes the database.
import fs from "node:fs"
import path from "node:path"
import { DATA_DIR } from "./env.mjs"

export function databaseFile() {
  return path.join(DATA_DIR, "rhenko.sqlite")
}

export function databaseProblem() {
  const file = databaseFile()
  if (!fs.existsSync(file)) {
    return `The database ${file} does not exist. Set RHENKO_DATA_DIR to the folder the server keeps its data in (the same value the server was started with).`
  }
  return null
}

async function open(readOnly) {
  const problem = databaseProblem()
  if (problem) throw new Error(problem)
  const { DatabaseSync } = await import("node:sqlite")
  const db = new DatabaseSync(databaseFile(), { readOnly })
  db.exec("PRAGMA busy_timeout = 5000")
  return db
}

// The id of a user's post with exactly this text.
export async function postIdByBody(handle, body) {
  const db = await open(true)
  try {
    const row = db
      .prepare("SELECT p.id AS id FROM posts p JOIN users u ON u.id = p.author_id WHERE u.handle = ? COLLATE NOCASE AND p.body = ? ORDER BY p.created_at DESC LIMIT 1")
      .get(handle, body)
    return row ? row.id : null
  } finally {
    db.close()
  }
}

export async function postState(id) {
  const db = await open(true)
  try {
    const row = db.prepare("SELECT is_draft, publish_at, created_at FROM posts WHERE id = ?").get(id)
    return row ? { draft: row.is_draft === 1, publishAt: row.publish_at, createdAt: row.created_at } : null
  } finally {
    db.close()
  }
}

// Moves one scheduled post's time. Only touches a post that is still waiting to go out.
export async function moveSchedule(id, at) {
  const db = await open(false)
  try {
    const result = db.prepare("UPDATE posts SET publish_at = ? WHERE id = ? AND is_draft = 0 AND publish_at IS NOT NULL").run(at, id)
    return Number(result.changes) === 1
  } finally {
    db.close()
  }
}
