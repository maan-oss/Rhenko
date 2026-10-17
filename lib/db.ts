import { AsyncLocalStorage } from "node:async_hooks"
import postgres, { type Sql, type TransactionSql } from "postgres"

// The database is Postgres: Supabase in production, any Postgres 16 or later for local work. The schema is in
// db/postgres/schema.sql. Queries are written with ? placeholders (or ?1, ?2 to reuse one), as they were for SQLite;
// they are turned into $1, $2 here. Every helper is async.

export type Param = string | number | null

type Connection = Sql | TransactionSql
const globals = globalThis as unknown as { __rhenkoSql?: Sql }
// The open transaction for the current async call chain, if any. Queries inside it run on its one connection.
const transactions = new AsyncLocalStorage<TransactionSql>()

function pool(): Sql {
  if (!globals.__rhenkoSql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error("DATABASE_URL is not set. It must point at the Postgres database.")
    globals.__rhenkoSql = postgres(url, {
      max: Number(process.env.RHENKO_DB_POOL) || 5,
      idle_timeout: 20,
      connect_timeout: 15,
      // The Supabase pooler runs in transaction mode, which does not keep prepared statements between queries.
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
  return globals.__rhenkoSql
}

function current(): Connection {
  return transactions.getStore() ?? pool()
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

// Refreshes the planner's statistics. Maintenance runs it now and then.
export async function optimizeDatabase(): Promise<void> {
  await run("analyze")
}
