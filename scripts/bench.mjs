// Seeds a scratch database with a realistic amount of data, starts the production server against it, and times the
// pages people use most. It never touches data/: pass a directory of your own.
//
//   node scripts/bench.mjs --dir <scratch dir> [--reseed] [--port 3400] [--runs 15] [--json <file>]
//
// Build first (npm run build). The timings are wall-clock time for the whole response, server render included.
import { DatabaseSync } from "node:sqlite"
import { createHash, randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const args = parseArgs(process.argv.slice(2))
if (!args.dir) {
  console.error("Usage: node scripts/bench.mjs --dir <scratch dir> [--reseed] [--port 3400] [--runs 15] [--json <file>]")
  process.exit(1)
}
const dir = path.resolve(args.dir)
const port = Number(args.port ?? 3400)
const runs = Number(args.runs ?? 15)
const scale = Number(args.scale ?? 1)
const dbFile = path.join(dir, "rhenko.sqlite")

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

const USERS = Math.round(2000 * scale)
const POSTS = Math.round(40000 * scale)
const VOCAB = Array.from({ length: 3000 }, word)
const TAGS = Array.from({ length: 300 }, word)

async function main() {
  if (args.reseed) fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const fresh = !fs.existsSync(dbFile)
  let token = null
  if (fresh) {
    // The first authenticated request creates the schema, the same way a real deployment does.
    console.log("Creating the schema through the server ...")
    const server = await startServer()
    await fetch(`http://127.0.0.1:${port}/`, { headers: { cookie: "rhenko_session=bootstrap" }, redirect: "manual" })
    await stopServer(server)
    token = seedDatabase()
  } else {
    token = readToken()
  }

  const server = await startServer()
  try {
    const results = await measure(token)
    printTable(results)
    if (args.json) fs.writeFileSync(args.json, JSON.stringify({ at: new Date().toISOString(), dbBytes: fs.statSync(dbFile).size, results }, null, 2))
  } finally {
    await stopServer(server)
  }
}

function seedDatabase() {
  console.log(`Seeding ${USERS} users and ${POSTS} posts ...`)
  const db = new DatabaseSync(dbFile)
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = OFF;")
  const now = Date.now()
  const DAY = 24 * 60 * 60 * 1000
  db.exec("BEGIN")
  const userIds = []
  const insertUser = db.prepare(
    "INSERT INTO users (id, handle, name, bio, password_hash, created_at, terms_version) VALUES (?, ?, ?, ?, 'x', ?, '2026-10-12')"
  )
  for (let i = 0; i < USERS; i++) {
    const id = `u${i}`
    userIds.push(id)
    insertUser.run(id, `user${i}`, `User ${i}`, `Bio for user ${i}`, now - 400 * DAY)
  }
  const viewer = "viewer"
  insertUser.run(viewer, "viewer", "Viewer", "The account the benchmark signs in as", now - 400 * DAY)
  db.exec("COMMIT")

  db.exec("BEGIN")
  const insertFollow = db.prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)")
  for (const id of [...userIds, viewer]) {
    for (let k = 0; k < 25; k++) insertFollow.run(id, pick(userIds), now - 200 * DAY)
  }
  db.exec("COMMIT")

  const postIds = []
  db.exec("BEGIN")
  const insertPost = db.prepare(
    "INSERT INTO posts (id, author_id, body, reply_to_id, quote_of_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
  for (let i = 0; i < POSTS; i++) {
    const id = `p${i}`
    const sentences = 1 + Math.floor(random() * 3)
    const parts = Array.from({ length: sentences }, () => Array.from({ length: 6 + Math.floor(random() * 10) }, () => pick(VOCAB)).join(" "))
    if (random() < 0.3) parts.push(`#${pick(TAGS)}`)
    if (random() < 0.15) parts.push(`@${pick(userIds).replace(/^u/, "user")}`)
    const replyTo = postIds.length > 0 && random() < 0.12 ? pick(postIds) : null
    const quoteOf = postIds.length > 0 && random() < 0.03 ? pick(postIds) : null
    postIds.push(id)
    insertPost.run(id, pick(userIds), parts.join(". "), replyTo, quoteOf, now - Math.floor(random() * 60 * DAY))
  }
  db.exec("COMMIT")

  // Engagement is heavy-tailed, as on a real network: most posts get a few likes, a few get thousands.
  db.exec("BEGIN")
  const insertLike = db.prepare("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)")
  const insertRepost = db.prepare("INSERT OR IGNORE INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?)")
  const insertView = db.prepare("INSERT OR IGNORE INTO post_views (post_id, viewer_id, created_at) VALUES (?, ?, ?)")
  for (const id of postIds) {
    const likes = Math.floor(Math.pow(random(), 6) * 120 * scale)
    for (let k = 0; k < likes; k++) insertLike.run(pick(userIds), id, now - Math.floor(random() * 30 * DAY))
    const reposts = Math.floor(Math.pow(random(), 6) * 30 * scale)
    for (let k = 0; k < reposts; k++) insertRepost.run(pick(userIds), id, now - Math.floor(random() * 30 * DAY))
    const views = likes + Math.floor(random() * 10)
    for (let k = 0; k < views; k++) insertView.run(id, pick(userIds), now - Math.floor(random() * 30 * DAY))
  }
  db.exec("COMMIT")

  db.exec("BEGIN")
  const insertNote = db.prepare("INSERT INTO notifications (id, recipient_id, actor_id, kind, post_id, read, created_at) VALUES (?, ?, ?, 'like', ?, ?, ?)")
  for (let i = 0; i < 3000; i++) {
    insertNote.run(`n${i}`, viewer, pick(userIds), pick(postIds), random() < 0.5 ? 1 : 0, now - Math.floor(random() * 30 * DAY))
  }
  db.exec("COMMIT")

  const raw = randomBytes(32).toString("hex")
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent, last_seen) VALUES (?, ?, ?, ?, 'bench', ?)").run(
    sha(raw),
    viewer,
    now,
    now + 30 * DAY,
    now
  )
  db.exec("PRAGMA optimize; ANALYZE;")
  db.close()
  fs.writeFileSync(path.join(dir, "bench-token.txt"), raw)
  return raw
}

function readToken() {
  return fs.readFileSync(path.join(dir, "bench-token.txt"), "utf8").trim()
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
    env: { ...process.env, RHENKO_DATA_DIR: dir, NODE_ENV: "production" },
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
