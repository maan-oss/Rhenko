import { change, get, run, transaction } from "@/lib/db"
import { isPublicP256Jwk, reportKeyId, type ReportPublicKey } from "@/lib/chat-reports"

// The server side of chat reports (lib/chat-reports.ts): the public report key the server seals with, the files a report keeps,
// and the removal of reports whose year is up. The private key is never here.

let configured: { raw: string; key: ReportPublicKey | null } | null = null

// The public half of the report key, from RHENKO_REPORT_KEY: the JSON of a public P-256 key, as scripts/moderation.mjs
// report-keygen prints it. Null when the variable is missing or not a public key, and reports are then refused, not stored
// some other way.
export async function configuredReportKey(): Promise<ReportPublicKey | null> {
  const raw = process.env.RHENKO_REPORT_KEY?.trim() ?? ""
  if (configured && configured.raw === raw) return configured.key
  let key: ReportPublicKey | null = null
  if (raw) {
    try {
      const jwk: unknown = JSON.parse(raw)
      if (!isPublicP256Jwk(jwk)) throw new Error("RHENKO_REPORT_KEY is not a public P-256 key")
      key = { kid: await reportKeyId(jwk), jwk }
    } catch (error) {
      console.error("[chat-reports] RHENKO_REPORT_KEY is not usable; chat reports are refused until it is fixed", error)
    }
  }
  configured = { raw, key }
  return key
}

// Whether a stored file is kept by a report. Such a file stays in storage for as long as the report does, even after the message,
// the chat or the sender's account is gone.
export async function reportFileKept(name: string): Promise<boolean> {
  return (await get("SELECT 1 AS found FROM chat_report_files WHERE file = ? LIMIT 1", name)) !== undefined
}

// Removes the reports whose retention has ended, and queues the files only they kept for deletion. The background pass removes a
// queued file unless another record still uses it. Returns how many reports went.
export async function purgeExpiredChatReports(now = Date.now()): Promise<number> {
  return transaction(async () => {
    await run(
      `INSERT INTO pending_file_deletions (name, created_at)
       SELECT DISTINCT f.file, CAST(? AS bigint) FROM chat_report_files f JOIN chat_reports r ON r.id = f.report_id
       WHERE r.retain_until < ?
       ON CONFLICT (name) DO NOTHING`,
      now,
      now
    )
    return change("DELETE FROM chat_reports WHERE retain_until < ?", now)
  })
}
