"use server"

import { revalidatePath } from "next/cache"
import { getAgreedViewer, newId } from "@/lib/auth"
import { publish } from "@/lib/bus"
import { all, change, get, run, transaction } from "@/lib/db"
import {
  CHAT_REPORT_MESSAGES,
  CHAT_REPORT_RETENTION_MS,
  CHAT_REPORT_VERSION,
  parseSealedReport,
  reportContext,
  sealReport,
  type ReportMedia,
  type ReportMessage,
  type ReportPayload,
  type SealedReport,
} from "@/lib/chat-reports"
import { clearChatMessage } from "@/lib/chat-removal"
import { configuredReportKey } from "@/lib/chat-report-store"
import { parseAttachment } from "@/lib/message-attachments"
import { consume, waitLabel } from "@/lib/rate-limit"
import { REPORT_REASONS, URGENT_REPORT } from "@/lib/rules"
import { contentTypeFor, uploadSize } from "@/lib/uploads"

// Reports of chat messages, as WhatsApp does them. The reporter picks a message and the messages up to it (the reported one and
// up to four before it) are sent to Rhenko for review. Nobody else in the chat is told. Rhenko keeps the report, and the files
// in it, for one year (lib/chat-reports.ts). The report is sealed to the report key before it is stored, so the server holds only
// ciphertext. In an encrypted chat the reporter's device seals it, because only that device can read the messages. In a chat that
// is not encrypted the server builds and seals it from what it stores.

export type ChatReportKey = { kid: string; jwk: JsonWebKey }
type ReportResult = { ok: true } | { ok: false; error: string }

const HOUR_MS = 60 * 60_000
const REPORTS_PER_HOUR = 10
const ID = /^[A-Za-z0-9_-]{1,64}$/

function asId(value: unknown): string | null {
  return typeof value === "string" && ID.test(value) ? value : null
}

// The public key a report is sealed to, for a signed-in browser. Null while reporting is not set up on the server.
export async function chatReportKey(): Promise<ChatReportKey | null> {
  if (!(await getAgreedViewer())) return null
  const key = await configuredReportKey()
  return key ? { kid: key.kid, jwk: key.jwk } : null
}

export async function reportChatMessage(input: {
  conversationId?: unknown
  messageId?: unknown
  reason?: unknown
  sealed?: unknown
}): Promise<ReportResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to report messages." }
  const conversationId = asId(input?.conversationId)
  const messageId = asId(input?.messageId)
  if (!conversationId || !messageId) return { ok: false, error: "That message doesn't exist any more." }
  const reason = typeof input?.reason === "string" ? input.reason : ""
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "Pick a reason." }

  const member = await get<{ status: string }>(
    "SELECT status FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
    conversationId,
    viewer.id
  )
  if (member?.status !== "accepted") return { ok: false, error: "That message doesn't exist any more." }
  const key = await configuredReportKey()
  if (!key) return { ok: false, error: "Reporting isn't available right now. Try again later." }

  const now = Date.now()
  const message = await get<{ sender_id: string; created_at: number | string; expires_at: number | string | null }>(
    "SELECT sender_id, created_at, expires_at FROM chat_messages WHERE id = ? AND conversation_id = ?",
    messageId,
    conversationId
  )
  // A message that has disappeared is gone from the chat, so it cannot be reported.
  if (!message || (message.expires_at !== null && Number(message.expires_at) <= now)) {
    return { ok: false, error: "That message doesn't exist any more." }
  }
  if (message.sender_id === viewer.id) return { ok: false, error: "You can't report your own message." }
  // Reporting the same message again changes nothing, so it is not counted against the limit.
  if (await get("SELECT 1 AS found FROM chat_reports WHERE reporter_id = ? AND message_id = ?", viewer.id, messageId)) return { ok: true }

  const limit = await consume(`chat-report:${viewer.id}`, REPORTS_PER_HOUR, HOUR_MS)
  if (!limit.ok) return { ok: false, error: `You've sent a lot of reports. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }

  const conversation = await get<{ e2ee: number | string }>("SELECT e2ee FROM conversations WHERE id = ?", conversationId)
  const encrypted = Number(conversation?.e2ee ?? 0) === 1
  const near = await windowOf(conversationId, messageId, Number(message.created_at), now)
  let sealed: SealedReport
  if (encrypted) {
    // The reporter's device sealed it. A report sealed to a key other than the current one is refused, so the page is reloaded.
    const given = parseSealedReport(input?.sealed)
    if (!given || given.kid !== key.kid) return { ok: false, error: "Reload the page and try again." }
    sealed = given
  } else {
    const payload: ReportPayload = {
      v: CHAT_REPORT_VERSION,
      reason,
      reportedMessageId: messageId,
      conversation: { id: conversationId, encrypted: false },
      messages: await Promise.all(near.map(reportMessageOf)),
      createdAt: now,
    }
    sealed = await sealReport(key, reportContext(conversationId, messageId, key.kid), payload)
  }

  // The files of the window are kept with the report, whichever side sealed it. A file is taken from the server's own rows, so a
  // report cannot keep a file that is not in this chat.
  const files = [...new Set(near.map((row) => row.media_file).filter((file): file is string => file !== null))]
  const reportId = newId()
  const created = await transaction(async () => {
    const added = await change(
      `INSERT INTO chat_reports (id, reporter_id, reported_user_id, conversation_id, message_id, kid, reason, sealed, created_at, retain_until, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
       ON CONFLICT (reporter_id, message_id) DO NOTHING`,
      reportId,
      viewer.id,
      message.sender_id,
      conversationId,
      messageId,
      key.kid,
      reason,
      JSON.stringify(sealed),
      now,
      now + CHAT_REPORT_RETENTION_MS
    )
    if (added === 0) return false
    for (const file of files) await run("INSERT INTO chat_report_files (report_id, file) VALUES (?, ?) ON CONFLICT DO NOTHING", reportId, file)
    return true
  })
  // A picture of someone shared without consent, or child sexual abuse material, comes out of the chat at once, as a post does
  // (URGENT_REPORT in lib/rules.ts). The report has already kept the sealed copy, so nothing is lost for review. The other messages
  // in the report stay in the chat until a moderator decides about them (scripts/moderation.mjs chat-hide).
  const urgent = URGENT_REPORT[reason]
  if (created && urgent) {
    const cleared = await clearChatMessage(messageId, now, {
      id: newId(),
      category: urgent.category,
      explanation: urgent.explanation,
      source: `chat-report:${reportId}`,
    })
    if (cleared) {
      const members = (await all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId)).map((row) => row.user_id)
      await publish(members, { type: "message", conversationId })
      revalidatePath("/", "layout")
    }
  }
  return { ok: true }
}

type WindowRow = {
  id: string
  sender_id: string
  handle: string
  body: string
  media_file: string | null
  attachment: string | null
  deleted_at: number | string | null
  created_at: number | string
}

// The reported message and the messages before it in the chat, oldest first. Messages that have disappeared are left out.
async function windowOf(conversationId: string, messageId: string, createdAt: number, now: number): Promise<WindowRow[]> {
  const rows = await all<WindowRow>(
    `SELECT m.id, m.sender_id, COALESCE(u.handle, '') AS handle, m.body, m.media_file, m.attachment, m.deleted_at, m.created_at
     FROM chat_messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = ? AND (m.expires_at IS NULL OR m.expires_at > ?)
       AND (m.created_at < ? OR (m.created_at = ? AND m.id <= ?))
     ORDER BY m.created_at DESC, m.id DESC LIMIT ?`,
    conversationId,
    now,
    createdAt,
    createdAt,
    messageId,
    CHAT_REPORT_MESSAGES
  )
  return rows.reverse()
}

// One message as a report holds it, for a chat that is not encrypted: the words and what the message carries, as the server stores them.
async function reportMessageOf(row: WindowRow): Promise<ReportMessage> {
  const attachment = parseAttachment(row.attachment)
  let media: ReportMedia | null = null
  if (row.media_file) {
    media = {
      name: attachment?.kind === "document" ? attachment.name : row.media_file,
      mime: contentTypeFor(row.media_file),
      size: await uploadSize(row.media_file),
      file: row.media_file,
      key: null,
      iv: null,
    }
  }
  return {
    id: row.id,
    sender: { id: row.sender_id, handle: row.handle },
    sentAt: Number(row.created_at),
    text: row.body,
    deleted: row.deleted_at !== null,
    media,
    attachment,
  }
}
