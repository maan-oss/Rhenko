// Seeds a scratch Postgres database with a realistic amount of data, starts the production server against it, and times
// the pages people use most. It never touches the app's own database: pass a scratch database of your own.
//
//   node scripts/bench.mjs --database-url <scratch url> [--reseed] [--port 3400] [--runs 15] [--json <file>]
//
// The scratch database must already exist and must not be the database DATABASE_URL points at, nor one named rhenko.
// If it has no schema yet, db/postgres/schema.sql is applied and the data is seeded. --reseed drops the public schema of
// the scratch database and seeds it again. Without it, the data already there is timed as it is. Each run signs in with a
// new session, so no token is kept between runs.
//
// Build first (npm run build). The timings are wall-clock time for the whole response, server render included.
import { createHash, randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import postgres from "postgres"

const USAGE = "Usage: node scripts/bench.mjs --database-url <scratch url> [--reseed] [--port 3400] [--runs 15] [--json <file>]"

function fail(message) {
  console.error(message)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
if (typeof args["database-url"] !== "string") fail(USAGE)
const scratchUrl = checkScratch(args["database-url"])
const port = Number(args.port ?? 3400)
const runs = Number(args.runs ?? 15)
const scale = Number(args.scale ?? 1)
const SCHEMA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "postgres", "schema.sql")

// The benchmark writes to its database, so it refuses the app's own database and any database named rhenko.
function checkScratch(text) {
  let target
  try {
    target = new URL(text)
  } catch {
    fail("--database-url is not a URL. Give a postgres:// URL for a scratch database.")
  }
  if (!["postgres:", "postgresql:"].includes(target.protocol)) fail("--database-url must start with postgres://.")
  const name = databaseName(target)
  if (!name) fail("--database-url must name the scratch database, for example postgres://user@127.0.0.1:5433/rhenko_bench.")
  if (name === "rhenko") fail("Refusing to use a database named rhenko. Give a scratch database of your own.")
  if (process.env.DATABASE_URL) {
    const main = new URL(process.env.DATABASE_URL)
    const sameHost = main.hostname === target.hostname && (main.port || "5432") === (target.port || "5432")
    if (sameHost && databaseName(main) === name) {
      fail("That is the database DATABASE_URL points at. Give a scratch database of your own.")
    }
  }
  return text
}

function databaseName(url) {
  return decodeURIComponent(url.pathname.replace(/^\//, ""))
}

// Repeatable: the same seed always gives the same data, so before and after runs compare like with like.
let seed = 20261012
function random() {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (list) => list[Math.floor(random() * list.length)]
const sha = (value) => createHash("sha256").update(value).digest("hex")
const SYLLABLES = ["ka", "ri", "to", "mel", "so", "ven", "dal", "ix", "per", "lo", "fu", "ne", "gar", "bi", "tu", "zan"]
const word = () => Array.from({ length: 2 + Math.floor(random() * 2) }, () => pick(SYLLABLES)).join("")
const DAY = 24 * 60 * 60 * 1000

const USERS = Math.round(2000 * scale)
const POSTS = Math.round(40000 * scale)
const VOCAB = Array.from({ length: 3000 }, word)
const TAGS = Array.from({ length: 300 }, word)
const VIEWER = "viewer"
// Rows per INSERT statement. Each statement carries at most a few thousand parameters.
const BATCH = 1000

// Counts, timestamps and flags come back as plain numbers, as they did from SQLite.
const NUMBER_TYPES = {
  number: {
    to: 0,
    from: [16, 20, 1700],
    parse: (value) => (value === "t" ? 1 : value === "f" ? 0 : Number(value)),
    serialize: (value) => String(value),
  },
}

async function main() {
  const sql = postgres(scratchUrl, { max: 1, prepare: false, types: NUMBER_TYPES })
  try {
    if (args.reseed) {
      console.log("Dropping the public schema of the scratch database ...")
      await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;").simple()
    }
    const [{ found }] = await sql.unsafe("SELECT (to_regclass('public.users') IS NOT NULL)::int AS found")
    if (found) {
      console.log("Using the data already in the scratch database. Pass --reseed to seed it again.")
    } else {
      console.log("Creating the schema from db/postgres/schema.sql ...")
      await sql.unsafe(fs.readFileSync(SCHEMA_FILE, "utf8")).simple()
      await seedDatabase(sql)
    }
    const token = await newSession(sql)
    const [{ bytes }] = await sql.unsafe("SELECT pg_database_size(current_database()) AS bytes")

    const server = await startServer()
    try {
      const results = await measure(token)
      printTable(results)
      if (args.json) fs.writeFileSync(args.json, JSON.stringify({ at: new Date().toISOString(), dbBytes: bytes, results }, null, 2))
    } finally {
      await stopServer(server)
    }
  } finally {
    await sql.end()
  }
}

// Inserts rows through one statement per batch, so a large seed does not make one round trip per row.
class Batch {
  constructor(tx, table, columns, tail = "") {
    this.tx = tx
    this.table = table
    this.columns = columns
    this.tail = tail
    this.rows = []
  }

  async add(row) {
    this.rows.push(row)
    if (this.rows.length >= BATCH) await this.flush()
  }

  async flush() {
    if (this.rows.length === 0) return
    const values = []
    const groups = this.rows.map((row) => {
      const marks = this.columns.map((column) => {
        values.push(row[column])
        return `$${values.length}`
      })
      return `(${marks.join(", ")})`
    })
    await this.tx.unsafe(`insert into ${this.table} (${this.columns.join(", ")}) values ${groups.join(", ")} ${this.tail}`, values)
    this.rows = []
  }
}

async function seedDatabase(sql) {
  console.log(`Seeding ${USERS} users and ${POSTS} posts ...`)
  const now = Date.now()
  const userIds = []

  await sql.begin(async (tx) => {
    const users = new Batch(tx, "users", ["id", "handle", "name", "bio", "password_hash", "created_at", "terms_version"])
    for (let i = 0; i < USERS; i++) {
      const id = `u${i}`
      userIds.push(id)
      await users.add({
        id,
        handle: `user${i}`,
        name: `User ${i}`,
        bio: `Bio for user ${i}`,
        password_hash: "x",
        created_at: now - 400 * DAY,
        terms_version: "2026-10-12",
      })
    }
    await users.add({
      id: VIEWER,
      handle: "viewer",
      name: "Viewer",
      bio: "The account the benchmark signs in as",
      password_hash: "x",
      created_at: now - 400 * DAY,
      terms_version: "2026-10-12",
    })
    await users.flush()
  })

  await sql.begin(async (tx) => {
    const follows = new Batch(tx, "follows", ["follower_id", "followee_id", "created_at"], "on conflict do nothing")
    for (const id of [...userIds, VIEWER]) {
      for (let k = 0; k < 25; k++) await follows.add({ follower_id: id, followee_id: pick(userIds), created_at: now - 200 * DAY })
    }
    await follows.flush()
  })

  const postIds = []
  await sql.begin(async (tx) => {
    const posts = new Batch(tx, "posts", ["id", "author_id", "body", "reply_to_id", "quote_of_id", "created_at"])
    for (let i = 0; i < POSTS; i++) {
      const id = `p${i}`
      const sentences = 1 + Math.floor(random() * 3)
      const parts = Array.from({ length: sentences }, () => Array.from({ length: 6 + Math.floor(random() * 10) }, () => pick(VOCAB)).join(" "))
      if (random() < 0.3) parts.push(`#${pick(TAGS)}`)
      if (random() < 0.15) parts.push(`@${pick(userIds).replace(/^u/, "user")}`)
      const replyTo = postIds.length > 0 && random() < 0.12 ? pick(postIds) : null
      const quoteOf = postIds.length > 0 && random() < 0.03 ? pick(postIds) : null
      postIds.push(id)
      await posts.add({
        id,
        author_id: pick(userIds),
        body: parts.join(". "),
        reply_to_id: replyTo,
        quote_of_id: quoteOf,
        created_at: now - Math.floor(random() * 60 * DAY),
      })
    }
    await posts.flush()
  })

  // Engagement is heavy-tailed, as on a real network: most posts get a few likes, a few get thousands.
  await sql.begin(async (tx) => {
    const likeBatch = new Batch(tx, "likes", ["user_id", "post_id", "created_at"], "on conflict do nothing")
    const repostBatch = new Batch(tx, "reposts", ["user_id", "post_id", "created_at"], "on conflict do nothing")
    const viewBatch = new Batch(tx, "post_views", ["post_id", "viewer_id", "created_at"], "on conflict do nothing")
    for (const id of postIds) {
      const likes = Math.floor(Math.pow(random(), 6) * 120 * scale)
      for (let k = 0; k < likes; k++) await likeBatch.add({ user_id: pick(userIds), post_id: id, created_at: now - Math.floor(random() * 30 * DAY) })
      const reposts = Math.floor(Math.pow(random(), 6) * 30 * scale)
      for (let k = 0; k < reposts; k++) await repostBatch.add({ user_id: pick(userIds), post_id: id, created_at: now - Math.floor(random() * 30 * DAY) })
      const views = likes + Math.floor(random() * 10)
      for (let k = 0; k < views; k++) await viewBatch.add({ post_id: id, viewer_id: pick(userIds), created_at: now - Math.floor(random() * 30 * DAY) })
    }
    await likeBatch.flush()
    await repostBatch.flush()
    await viewBatch.flush()
  })

  await sql.begin(async (tx) => {
    const notes = new Batch(tx, "notifications", ["id", "recipient_id", "actor_id", "kind", "post_id", "read", "created_at"])
    for (let i = 0; i < 3000; i++) {
      await notes.add({
        id: `n${i}`,
        recipient_id: VIEWER,
        actor_id: pick(userIds),
        kind: "like",
        post_id: pick(postIds),
        read: random() < 0.5 ? 1 : 0,
        created_at: now - Math.floor(random() * 30 * DAY),
      })
    }
    await notes.flush()
  })

  await sql.unsafe("ANALYZE")
}

// A session for the benchmark's own account. Its token lives in memory for this run only.
async function newSession(sql) {
  const raw = randomBytes(32).toString("hex")
  const now = Date.now()
  await sql.unsafe(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, last_seen) VALUES ($1, $2, $3, $4, 'bench', $5)",
    [sha(raw), VIEWER, now, now + 30 * DAY, now]
  )
  return raw
}

// Words the search runs use: common ones, a rare one, and one with an operator.
function routes() {
  const common = VOCAB[3]
  const rare = VOCAB[2900]
  return [
    ["Sign-in page, no session", "/login", true],
    ["Home, For you", "/"],
    ["Home, Following", "/?tab=following"],
    ["Explore, top", "/explore"],
    ["Explore, latest", "/explore?sort=latest"],
    ["Search, common word", `/search?q=${encodeURIComponent(common)}`],
    ["Search, rare word", `/search?q=${encodeURIComponent(rare)}`],
    ["Search, word and author", `/search?q=${encodeURIComponent(common)}%20from:user7`],
    ["Profile, posts", "/user7"],
    ["Profile, followers", "/user7/followers"],
    ["Topic page", `/topics/${TAGS[0]}`],
    ["Notifications", "/notifications"],
  ]
}

async function measure(token) {
  const out = []
  for (const [label, route, anonymous] of routes()) {
    const times = []
    let status = 0
    let bytes = 0
    for (let i = 0; i < runs + 2; i++) {
      const started = performance.now()
      const response = await fetch(`http://127.0.0.1:${port}${route}`, {
        headers: anonymous ? {} : { cookie: `rhenko_session=${token}` },
        redirect: "manual",
      })
      const body = await response.arrayBuffer()
      const elapsed = performance.now() - started
      status = response.status
      bytes = body.byteLength
      if (i >= 2) times.push(elapsed) // the first two runs warm the server
    }
    times.sort((a, b) => a - b)
    out.push({
      label,
      route,
      status,
      kb: Math.round(bytes / 1024),
      p50: round(percentile(times, 0.5)),
      p95: round(percentile(times, 0.95)),
    })
  }
  return out
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
}

const round = (value) => Math.round(value * 10) / 10

function printTable(rows) {
  const width = Math.max(...rows.map((r) => r.label.length))
  console.log(`\n${"Page".padEnd(width)}  status    p50 ms    p95 ms     KB`)
  for (const r of rows) {
    console.log(`${r.label.padEnd(width)}  ${String(r.status).padEnd(6)}  ${String(r.p50).padStart(8)}  ${String(r.p95).padStart(8)}  ${String(r.kb).padStart(6)}`)
  }
  console.log("")
}

function startServer() {
  const server = spawn(process.execPath, [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: scratchUrl, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  })
  server.stderr.on("data", () => {})
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 60_000
    const probe = async () => {
      try {
        await fetch(`http://127.0.0.1:${port}/login`, { redirect: "manual" })
        resolve(server)
      } catch {
        if (Date.now() > deadline) return reject(new Error("The server did not start in time"))
        setTimeout(probe, 300)
      }
    }
    setTimeout(probe, 500)
  })
}

async function stopServer(server) {
  try {
    process.kill(-server.pid, "SIGTERM")
  } catch {
    /* already stopped */
  }
  await new Promise((resolve) => setTimeout(resolve, 500))
}

function parseArgs(list) {
  const parsed = {}
  for (let i = 0; i < list.length; i++) {
    const key = list[i]
    if (!key.startsWith("--")) continue
    const name = key.slice(2)
    const next = list[i + 1]
    if (next === undefined || next.startsWith("--")) parsed[name] = true
    else {
      parsed[name] = next
      i++
    }
  }
  return parsed
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
