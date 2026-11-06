import type { MessageView } from "@/lib/data"
import { ENCRYPTED_PREVIEW } from "@/lib/e2ee-chat"
import {
  CHAT_REPORT_MESSAGES,
  CHAT_REPORT_VERSION,
  reportContext,
  sealReport,
  type ReportMessage,
  type ReportPayload,
  type ReportPublicKey,
  type SealedReport,
} from "@/lib/chat-reports"

// Seals a report of a message in an encrypted chat, on this device. The device has opened the messages, so it knows what they say, and
// the server never does. The report holds the reported message and up to four before it, as this device shows them. A report is
// refused while any of those messages is still locked here, because it would hold the placeholder instead of the words.
export async function sealLocalReport(input: {
  conversationId: string
  messages: MessageView[]
  messageId: string
  reason: string
  key: ReportPublicKey
}): Promise<{ ok: true; sealed: SealedReport } | { ok: false; error: string }> {
  const index = input.messages.findIndex((message) => message.id === input.messageId)
  if (index < 0) return { ok: false, error: "That message isn't on this screen any more." }
  const near = input.messages.slice(Math.max(0, index + 1 - CHAT_REPORT_MESSAGES), index + 1)
  if (near.some((message) => message.sealed !== null && !message.deleted && message.body === ENCRYPTED_PREVIEW)) {
    return { ok: false, error: "Some of these messages haven't opened on this device yet. Wait a moment, then report again." }
  }
  const payload: ReportPayload = {
    v: CHAT_REPORT_VERSION,
    reason: input.reason,
    reportedMessageId: input.messageId,
    conversation: { id: input.conversationId, encrypted: true },
    messages: near.map(messageOf),
    createdAt: Date.now(),
  }
  const sealed = await sealReport(input.key, reportContext(input.conversationId, input.messageId, input.key.kid), payload)
  return { ok: true, sealed }
}

// One message as the report holds it. The words and the file's key come from the opened payload, and the file's bytes are the
// ciphertext the server already keeps.
function messageOf(message: MessageView): ReportMessage {
  const attachment = message.sealedAttachment ?? null
  const media = attachment?.kind === "media" ? attachment.media : null
  return {
    id: message.id,
    sender: { id: message.senderId, handle: message.senderHandle },
    sentAt: message.createdAt,
    text: message.deleted ? "" : message.body,
    deleted: message.deleted,
    media: media ? { name: media.name, mime: media.mime, size: media.size, file: media.file, key: media.key, iv: media.iv } : null,
    attachment: attachment && attachment.kind !== "media" ? attachment : null,
  }
}
