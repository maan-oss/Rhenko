import { connection } from "next/server"
import { get } from "@/lib/db"

// What the container health check and uptime monitors call. It reads the database, so it fails
// when the file cannot be opened or migrated. Nothing about the failure is sent to the caller.
export async function GET() {
  // Without this the response is built once at build time and never reflects the database.
  await connection()
  const headers = { "Cache-Control": "no-store" }
  try {
    if ((await get<{ ok: number }>("SELECT 1 AS ok"))?.ok !== 1) throw new Error("SELECT 1 did not return 1")
    return Response.json({ ok: true, db: true, time: new Date().toISOString() }, { headers })
  } catch (error) {
    console.error("Health check failed: the database did not answer.", error)
    return Response.json({ ok: false }, { status: 503, headers })
  }
}
