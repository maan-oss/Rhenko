import { AsyncLocalStorage } from "node:async_hooks"
import postgres, { type Sql, type TransactionSql } from "postgres"

// The database is Postgres: Supabase in production, any Postgres 16 or later for local work. The schema is in
// db/postgres/schema.sql. Queries are written with ? placeholders (or ?1, ?2 to reuse one), as they were for SQLite;
// they are turned into $1, $2 here. Every helper is async.

export type Param = string | number | null

type Connection = Sql | TransactionSql
const globals = globalThis as unknown as { __rhenkoSql?: Sql; __rhenkoReplica?: Sql }
// The open transaction for the current async call chain, if any. Queries inside it run on its one connection.
const transactions = new AsyncLocalStorage<TransactionSql>()

// Connection settings shared by the primary, the replica and the direct listener.
function connect(url: string, max: number): Sql {
  return postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 15,
    // A transaction-mode pooler (PgBouncer, or the Supabase pooler) does not keep prepared statements between queries.
    prepare: false,
    // Counts and timestamps come back as bigint and sums as numeric. They are read as plain numbers, as they were
    // before. Parameters keep Postgres's own type inference, so a fractional value is never sent as an integer.
    types: {
      // Flags come back as 1 or 0, as they did from SQLite. That covers booleans from EXISTS. Counts are bigint and
      // sums are numeric, read as plain numbers.
      number: {
        to: 0,
        from: [16, 20, 1700],
        parse: (value: string) => (value === "t" ? 1 : value === "f" ? 0 : Number(value)),
        serialize: (value: unknown) => String(value),
      },
    },
  })
}

function pool(): Sql {
  if (!globals.__rhenkoSql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set. It must point at the Postgres database.")
    globals.__rhenkoSql = connect(url, Number(process.env.RHENKO_DB_POOL) || 5)
  }
  return globals.__rhenkoSql
}

// A streaming replica of the primary, when RHENKO_DATABASE_REPLICA_URL is set. Only the reads that are explicitly
// written as readAll/readGet use it, and they run on it only when no transaction is open.
function replica(): Sql | null {
  const url = process.env.RHENKO_DATABASE_REPLICA_URL
  if (!url) return null
  if (!globals.__rhenkoReplica) globals.__rhenkoReplica = connect(url, Number(process.env.RHENKO_REPLICA_POOL) || 5)
  return globals.__rhenkoReplica
}

// The direct connection that LISTEN needs. A transaction-mode pooler cannot keep one, so RHENKO_LISTEN_URL points past it.
// Without it, LISTEN uses the primary connection.
let listener: Sql | null = null
function listenerPool(): Sql {
  const url = process.env.RHENKO_LISTEN_URL
  if (!url) return pool()
  if (!listener) listener = connect(url, 1)
  return listener
}

function current(): Connection {
  return transactions.getStore() ?? pool()
}

// The connection for a read that may lag a little. Inside a transaction it reads the primary, so a transaction always
// sees its own writes.
function readConnection(): Connection {
  return transactions.getStore() ?? replica() ?? pool()
}

// Question marks become numbered placeholders. Text inside quotes is left alone. The result is cached per statement text.
const converted = new Map<string, string>()
function toPostgres(sqlText: string): string {
  const hit = converted.get(sqlText)
  if (hit !== undefined) return hit
  let next = 0
  const text = sqlText.replace(/'(?:[^']|'')*'|\?(\d+)?/g, (match, digits: string | undefined) => {
    if (match.startsWith("'")) return match
    if (digits) {
      next = Number(digits)
      return `$${digits}`
    }
    next += 1
    return `$${next}`
  })
  if (converted.size > 2000) converted.clear()
  converted.set(sqlText, text)
  return text
}

// Rows come back as plain objects, which React can pass from a server component to a client component.
export async function all<T>(sqlText: string, ...params: Param[]): Promise<T[]> {
  const rows = await current().unsafe(toPostgres(sqlText), params)
  return [...rows] as unknown as T[]
}

export async function get<T>(sqlText: string, ...params: Param[]): Promise<T | undefined> {
  const rows = await current().unsafe(toPostgres(sqlText), params)
  return rows[0] as unknown as T | undefined
}

export async function run(sqlText: string, ...params: Param[]): Promise<void> {
  await current().unsafe(toPostgres(sqlText), params)
}

// Whether reads can go to a replica at all.
export function replicaConfigured(): boolean {
  return Boolean(process.env.RHENKO_DATABASE_REPLICA_URL)
}

// Reads for shared content that may lag the primary by a moment: feeds, search and Explore. Each caller says so by using
// these, so reads of a person's own writes stay on readAll/readGet. Without RHENKO_DATABASE_REPLICA_URL they are the same.
export async function readAll<T>(sqlText: string, ...params: Param[]): Promise<T[]> {
  const rows = await readConnection().unsafe(toPostgres(sqlText), params)
  return [...rows] as unknown as T[]
}

export async function readGet<T>(sqlText: string, ...params: Param[]): Promise<T | undefined> {
  const rows = await readConnection().unsafe(toPostgres(sqlText), params)
  return rows[0] as unknown as T | undefined
}

// Runs a statement and returns how many rows it changed.
export async function change(sqlText: string, ...params: Param[]): Promise<number> {
  const result = await current().unsafe(toPostgres(sqlText), params)
  return result.count
}

// Runs a function inside a transaction. Rolls back when it throws. A transaction opened inside another one is a savepoint
// of it, so functions that each take a transaction can call one another.
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const open = transactions.getStore()
  if (open) return (await open.savepoint((inner) => transactions.run(inner, fn))) as unknown as T
  return (await pool().begin((tx) => transactions.run(tx, fn))) as unknown as T
}

// Runs work that outlives the call that started it, such as sending pushes, outside any open transaction. Its queries then
// use the pool, not a transaction that may have ended by the time they run.
export function outsideTransaction<T>(fn: () => T): T {
  return transactions.exit(fn)
}

// Refreshes the planner's statistics. Maintenance runs it now and then.
export async function optimizeDatabase(): Promise<void> {
  await run("analyze")
}

// Calls onNotify each time Postgres sends a NOTIFY on the channel. postgres.js keeps that connection open on its own and
// reconnects by itself. It needs a session connection to Postgres, not a transaction-mode pooler: RHENKO_LISTEN_URL.
export async function listen(channel: string, onNotify: () => void): Promise<void> {
  await listenerPool().listen(channel, () => onNotify())
}
