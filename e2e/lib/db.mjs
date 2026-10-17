// Direct access to the server's Postgres database (DATABASE_URL), for checks the browser cannot make. The scheduled post
// check moves one post's time to 30 seconds from now, because the product refuses a schedule less than five minutes
// ahead. The legal checks read notices, appeals and posts, and set up one account whose agreement is out of date. Every
// other check goes through the pages.
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { DATA_DIR } from "./env.mjs"

// Counts, timestamps and flags come back as plain numbers, the same as lib/db.ts reads them.
const TYPES = {
  number: {
    to: 0,
    from: [16, 20, 1700],
    parse: (value) => (value === "t" ? 1 : value === "f" ? 0 : Number(value)),
    serialize: (value) => String(value),
  },
}

export function databaseProblem() {
  if (!process.env.DATABASE_URL) {
    return "DATABASE_URL is not set. Set it to the Postgres database the server uses (the same value the server was started with)."
  }
  return null
}

// Opens one connection for one check, runs it, and closes the connection again.
async function withDatabase(run) {
  const problem = databaseProblem()
  if (problem) throw new Error(problem)
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, types: TYPES })
  try {
    return await run(sql)
  } finally {
    await sql.end()
  }
}

// Question marks become $1, $2, ... as they do in lib/db.ts. Text inside quotes is left alone.
function toPostgres(text) {
  let next = 0
  return text.replace(/'(?:[^']|'')*'|\?(\d+)?/g, (match, digits) => {
    if (match.startsWith("'")) return match
    if (digits) {
      next = Number(digits)
      return `$${digits}`
    }
    next += 1
    return `$${next}`
  })
}

// The id of a user's post with exactly this text.
export async function postIdByBody(handle, body) {
  return withDatabase(async (sql) => {
    const [row] = await sql.unsafe(
      "SELECT p.id AS id FROM posts p JOIN users u ON u.id = p.author_id WHERE u.handle = $1 AND p.body = $2 ORDER BY p.created_at DESC LIMIT 1",
      [handle, body]
    )
    return row ? row.id : null
  })
}

export async function postState(id) {
  return withDatabase(async (sql) => {
    const [row] = await sql.unsafe("SELECT is_draft, publish_at, created_at FROM posts WHERE id = $1", [id])
    return row ? { draft: row.is_draft === 1, publishAt: row.publish_at, createdAt: row.created_at } : null
  })
}

// Reads rows for a check. Nothing is changed.
export async function query(sqlText, ...params) {
  return withDatabase(async (sql) => [...(await sql.unsafe(toPostgres(sqlText), params))])
}

// Changes rows for a check, and says how many changed.
export async function execute(sqlText, ...params) {
  return withDatabase(async (sql) => Number((await sql.unsafe(toPostgres(sqlText), params)).count))
}

// Moves one scheduled post's time. Only touches a post that is still waiting to go out.
export async function moveSchedule(id, at) {
  return withDatabase(async (sql) => {
    const result = await sql.unsafe("UPDATE posts SET publish_at = $1 WHERE id = $2 AND is_draft = 0 AND publish_at IS NOT NULL", [at, id])
    return result.count === 1
  })
}

// Stores a picture the way the server stores uploads: in the uploads folder when RHENKO_STORAGE=local, and in the
// Supabase media bucket otherwise (the server's default).
async function storePicture(name, picture) {
  if (process.env.RHENKO_STORAGE === "local") {
    fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true })
    fs.copyFileSync(picture, path.join(DATA_DIR, "uploads", name))
    return
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to store uploads.")
  const bucket = process.env.RHENKO_MEDIA_BUCKET || "media"
  const res = await fetch(`${url.replace(/\/$/, "")}/storage/v1/object/${bucket}/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "image/png", "x-upsert": "true" },
    body: fs.readFileSync(picture),
  })
  if (!res.ok) throw new Error(`Storage refused ${name} (${res.status}): ${await res.text()}`)
}

// Keeps a link's preview as the server would after reading its page: the title, a line, the site and a picture stored
// under the name the server gives it. The server reads a fresh row and does not fetch the page.
export async function keepLinkPreview({ link, title, description, site, picture }) {
  // A random name, as the server gives a link picture now. The row keeps the name, so nothing else depends on it.
  const name = crypto.randomUUID().replace(/-/g, "") + ".png"
  await storePicture(name, picture)
  await withDatabase((sql) =>
    sql.unsafe(
      `INSERT INTO link_previews (url, title, description, site, image_file, fetched_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (url) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, site = EXCLUDED.site,
         image_file = EXCLUDED.image_file, fetched_at = EXCLUDED.fetched_at`,
      [link, title, description, site, name, Date.now()]
    )
  )
  return name
}
