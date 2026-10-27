"use server"

import { getAgreedViewer } from "@/lib/auth"
import { canSeeLivePost } from "@/lib/data"
import { get } from "@/lib/db"
import { detectLanguage } from "@/lib/languages"
import { consume, waitLabel } from "@/lib/rate-limit"
import {
  cachedMessageTranslation,
  cachedPostTranslation,
  keepMessageTranslation,
  keepPostTranslation,
  TRANSLATE_MAX_CHARS,
  translateText,
  translationOn,
} from "@/lib/translate"

export type TranslateResult = { ok: true; text: string; source: string } | { ok: false; error: string }

const MAX_ID = 64
const HOUR = 60 * 60 * 1000
// Translations a person can ask for in an hour. Each one is a call to the service the operator chose.
const PER_HOUR = 120

// The language a reader gets: the first one they speak. A text already in one of the languages they speak is not translated.
function targetFor(speaks: readonly string[]): string {
  return speaks[0] ?? "en"
}

// Translates a post the viewer can see, into the first language they speak. Each translation is kept, so asking again
// costs nothing and does not call the service.
export async function translatePost(postId: string): Promise<TranslateResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to translate posts." }
  if (typeof postId !== "string" || postId.length === 0 || postId.length > MAX_ID) return { ok: false, error: "That post can't be found." }
  if (!translationOn()) return { ok: false, error: "Translation isn't set up on this server." }
  if (!await canSeeLivePost(postId, viewer.id)) return { ok: false, error: "That post can't be found." }

  const post = await get<{ body: string; lang: string | null }>("SELECT body, lang FROM posts WHERE id = ?", postId)
  if (!post) return { ok: false, error: "That post can't be found." }
  if (post.body.trim() === "") return { ok: false, error: "There is no text to translate." }
  if (post.body.length > TRANSLATE_MAX_CHARS) return { ok: false, error: "This post is too long to translate here." }

  const target = targetFor(viewer.speaks)
  const source = post.lang || detectLanguage(post.body) || "auto"
  if (source !== "auto" && viewer.speaks.includes(source)) return { ok: false, error: "This post is already in a language you read." }

  const kept = await cachedPostTranslation(postId, target)
  if (kept) return { ok: true, text: kept.text, source: kept.source }

  const limit = await consume(`translate:${viewer.id}`, PER_HOUR, HOUR)
  if (!limit.ok) return { ok: false, error: `You've asked for a lot of translations. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }

  const result = await translateText(post.body, source, target)
  if (!result.ok) return result
  await keepPostTranslation(postId, target, result.source, result.text)
  return { ok: true, text: result.text, source: result.source }
}

// The same for a direct message. Only someone in the conversation can see its text.
export async function translateMessage(messageId: string): Promise<TranslateResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to translate messages." }
  if (typeof messageId !== "string" || messageId.length === 0 || messageId.length > MAX_ID) return { ok: false, error: "That message can't be found." }
  if (!translationOn()) return { ok: false, error: "Translation isn't set up on this server." }

  // A message from someone the viewer has blocked, or who has blocked them, is not readable here either, and nor is a
  // disappearing message whose time is up.
  const message = await get<{ body: string; lang: string | null; deleted_at: number | null }>(
    `SELECT m.body, m.lang, m.deleted_at FROM chat_messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
     WHERE m.id = ? AND (m.expires_at IS NULL OR m.expires_at > ?) AND NOT EXISTS (
       SELECT 1 FROM blocks bl WHERE (bl.blocker_id = ? AND bl.blocked_id = m.sender_id) OR (bl.blocker_id = m.sender_id AND bl.blocked_id = ?))`,
    viewer.id,
    messageId,
    Date.now(),
    viewer.id,
    viewer.id
  )
  if (!message || message.deleted_at !== null) return { ok: false, error: "That message can't be found." }
  if (message.body.trim() === "") return { ok: false, error: "There is no text to translate." }
  if (message.body.length > TRANSLATE_MAX_CHARS) return { ok: false, error: "This message is too long to translate here." }

  const target = targetFor(viewer.speaks)
  const source = message.lang || detectLanguage(message.body) || "auto"
  if (source !== "auto" && viewer.speaks.includes(source)) return { ok: false, error: "This message is already in a language you read." }

  const kept = await cachedMessageTranslation(messageId, target)
  if (kept) return { ok: true, text: kept.text, source: kept.source }

  const limit = await consume(`translate:${viewer.id}`, PER_HOUR, HOUR)
  if (!limit.ok) return { ok: false, error: `You've asked for a lot of translations. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }

  const result = await translateText(message.body, source, target)
  if (!result.ok) return result
  await keepMessageTranslation(messageId, target, result.source, result.text)
  return { ok: true, text: result.text, source: result.source }
}
