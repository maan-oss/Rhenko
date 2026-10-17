// Checks the read replica through the same helpers the app uses (lib/db.ts). It proves four things:
//
//   1. reads written as readAll/readGet go to the replica, and get/all go to the primary;
//   2. a write reaches the replica within a moment, and how long it takes;
//   3. with replay paused on the replica, a write is on the primary but not yet on the replica, and a transaction still
//      reads its own writes, because it reads the primary;
//   4. a burst of writes catches up once replay resumes.
//
// It works on a scratch database of its own (PROBE_DB, default rhenko_probe), so the app's data is not touched. The
// database must exist and be owned by the role in DATABASE_URL. The replica is a streaming replica of the same cluster,
// on REPLICA_PORT of the same host. Pausing replay needs a superuser on the replica: the script runs psql as REPLICA_OS_USER
// (default postgres) over the replica's socket in REPLICA_SOCKET_DIR (default /var/run/postgresql).
//
//   DATABASE_URL=postgres://rhenko:…@127.0.0.1:5432/rhenko node scripts/replica-check.mjs
//
// Exits 0 when every check passes, 1 when one fails.
import { execFileSync } from "node:child_process"
import { get, readGet, replicaConfigured, run, transaction } from "../lib/db.ts"

const PROBE_DB = process.env.PROBE_DB || "rhenko_probe"
const REPLICA_PORT = Number(process.env.REPLICA_PORT || 5433)
const REPLICA_OS_USER = process.env.REPLICA_OS_USER || "postgres"
const REPLICA_SOCKET_DIR = process.env.REPLICA_SOCKET_DIR || "/var/run/postgresql"

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Point it at the primary, with any database name: the probe database replaces it.")
  process.exit(2)
}
const primary = new URL(process.env.DATABASE_URL)
primary.pathname = `/${PROBE_DB}`
const replica = new URL(primary)
replica.port = String(REPLICA_PORT)
process.env.DATABASE_URL = primary.toString()
process.env.RHENKO_DATABASE_REPLICA_URL = replica.toString()

// Runs a statement on the replica as its superuser, for pausing and resuming replay.
function replicaSql(sql) {
  return execFileSync(
    "runuser",
    ["-u", REPLICA_OS_USER, "--", "psql", "-h", REPLICA_SOCKET_DIR, "-p", String(REPLICA_PORT), "-d", PROBE_DB, "-XtAc", sql],
    { encoding: "utf8" }
  ).trim()
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Polls until check() is true. Returns how long that took in ms, or null if it did not happen within the limit.
async function until(check, limitMs = 15000) {
  const started = performance.now()
  while (performance.now() - started < limitMs) {
    if (await check()) return Math.round(performance.now() - started)
    await sleep(20)
  }
  return null
}

const count = async (read, note) => (await read("select count(*)::int as n from probe where note = ?", note))?.n ?? 0

let failed = 0
function report(name, ok, detail) {
  if (!ok) failed += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`)
}

async function main() {
  report("the replica is configured for reads", replicaConfigured())

  // Table set up on the primary, then waited for on the replica.
  await run("drop table if exists probe")
  await run("create table probe (id bigserial primary key, note text not null)")
  const setup = await until(async () => (await readGet("select to_regclass('probe') is not null as ok"))?.ok === 1)
  report("the probe table reaches the replica", setup !== null, setup !== null ? `${setup} ms` : "not seen")

  // 1. Routing: pg_is_in_recovery() is true on a standby, false on the primary.
  const viaRead = await readGet("select pg_is_in_recovery() as standby")
  const viaGet = await get("select pg_is_in_recovery() as standby")
  report(
    "readGet reads the replica, get reads the primary",
    viaRead?.standby === 1 && viaGet?.standby === 0,
    `readGet standby=${viaRead?.standby}, get standby=${viaGet?.standby}`
  )

  // 2. A write reaches the replica within a moment.
  await run("insert into probe (note) values (?)", "first")
  const first = await until(async () => (await count(readGet, "first")) === 1)
  report("a write reaches the replica", first !== null && first < 2000, first !== null ? `visible after ${first} ms` : "never seen")

  // 3. Replay paused: the write is on the primary, not on the replica.
  replicaSql("select pg_wal_replay_pause()")
  const paused = replicaSql("select pg_is_wal_replay_paused()") === "t"
  report("replay is paused on the replica", paused)

  await run("insert into probe (note) values (?)", "paused")
  await sleep(600)
  const onPrimary = (await count(get, "paused")) === 1
  const onReplica = (await count(readGet, "paused")) === 1
  report("while paused, a write is on the primary and not on the replica", onPrimary && !onReplica, `primary=${onPrimary}, replica=${onReplica}`)

  // 3b. A transaction reads its own writes, because it reads the primary. Outside it, the replica is still behind.
  const inside = await transaction(async () => {
    await run("insert into probe (note) values (?)", "in-tx")
    return count(readGet, "in-tx")
  })
  const afterCommit = await count(readGet, "in-tx")
  report(
    "a transaction reads its own write while the replica is behind",
    inside === 1 && afterCommit === 0,
    `inside=${inside}, replica after commit=${afterCommit}`
  )

  // 3c. A rolled-back transaction leaves nothing on the primary.
  await transaction(async () => {
    await run("insert into probe (note) values (?)", "rolled")
    throw new Error("roll back on purpose")
  }).catch(() => {})
  const rolled = await count(get, "rolled")
  report("a rolled-back write is on neither side", rolled === 0, `primary=${rolled}`)

  // 4. Replay resumes: the paused write and the committed transaction appear on the replica.
  replicaSql("select pg_wal_replay_resume()")
  const caughtUp = await until(async () => (await count(readGet, "paused")) === 1 && (await count(readGet, "in-tx")) === 1)
  report("after replay resumes, the replica catches up", caughtUp !== null, caughtUp !== null ? `${caughtUp} ms` : "still behind")

  // 5. A burst of writes, measured.
  const burstStart = performance.now()
  await run("insert into probe (note) select 'burst' from generate_series(1, 2000)")
  const primaryBurst = performance.now() - burstStart
  const burst = await until(async () => (await count(readGet, "burst")) === 2000, 30000)
  report(
    "a burst of 2,000 writes reaches the replica",
    burst !== null && burst < 5000,
    burst !== null ? `primary write ${Math.round(primaryBurst)} ms, replica visible after ${burst} ms` : "not all visible"
  )

  const lag = replicaSql("select coalesce(round(extract(epoch from now() - pg_last_xact_replay_timestamp()) * 1000), -1)")
  console.log(`info  replica replay lag now: ${lag} ms`)

  await run("drop table probe")
}

try {
  await main()
} catch (error) {
  failed += 1
  console.log(`FAIL  the check stopped: ${error?.message ?? error}`)
} finally {
  try {
    replicaSql("select pg_wal_replay_resume()")
  } catch {
    // The replica may already be gone; nothing to resume.
  }
}
console.log(failed === 0 ? "\nall replica checks passed" : `\n${failed} replica check(s) failed`)
process.exit(failed === 0 ? 0 : 1)
