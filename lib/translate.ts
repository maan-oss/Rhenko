// Translation of posts and messages, through a translation service the operator chooses. Server only.
//
// The app does nothing with translation unless RHENKO_TRANSLATE_URL is set. When it is, the text a reader asks to translate
// is sent to that service, and nothing else is: the Privacy Policy says so, and the operator names the service there. The
// service is expected to speak the LibreTranslate interface (POST {url}/translate, answered by {translatedText}), which
// several self-hosted and hosted services do. The reader asks for each translation, and each one is kept with the post or
// message, so the same text is not sent twice. Editing a post clears its translations.
import { all, get, run, transaction } from "@/lib/db"
import { detectLanguage } from "@/lib/languages"

// Longer text is not sent. A post can be 25,000 characters; a translation of that is slow and not what a reader wants.
export const TRANSLATE_MAX_CHARS = 5000
const TIMEOUT_MS = 10_000
const UNAVAILABLE = "Translation isn't available right now. Try again later."

export function translationOn(): boolean {
  return (process.env.RHENKO_TRANSLATE_URL ?? "").trim() !== ""
}

export type Translation = { ok: true; text: string; source: string } | { ok: false; error: string }

// Asks the service for one translation. `source` is a language code, or "auto" when the language is not known.
export async function translateText(text: string, source: string, target: string): Promise<Translation> {
  const base = (process.env.RHENKO_TRANSLATE_URL ?? "").trim().replace(/\/+$/, "")
  if (!base) return { ok: false, error: "Translation isn't set up on this server." }
  const key = (process.env.RHENKO_TRANSLATE_KEY ?? "").trim()
  try {
    const response = await fetch(`${base}/translate`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ q: text, source, target, format: "text", ...(key ? { api_key: key } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error(`[translate] the service answered ${response.status}`)
      return { ok: false, error: UNAVAILABLE }
    }
    const data = (await response.json()) as { translatedText?: unknown }
    if (typeof data.translatedText !== "string" || data.translatedText.trim() === "") return { ok: false, error: UNAVAILABLE }
    return { ok: true, text: data.translatedText, source }
  } catch (error) {
    console.error("[translate] the service did not answer", error)
    return { ok: false, error: UNAVAILABLE }
  }
}

// The translation of a post or message into one language, kept from an earlier request.
export function cachedPostTranslation(postId: string, target: string): { text: string; source: string } | null {
  return get<{ text: string; source: string }>("SELECT text, source FROM post_translations WHERE post_id = ? AND target = ?", postId, target) ?? null
}

export function keepPostTranslation(postId: string, target: string, source: string, text: string): void {
  run(
    "INSERT OR REPLACE INTO post_translations (post_id, target, source, text, created_at) VALUES (?, ?, ?, ?, ?)",
    postId,
    target,
    source,
    text,
    Date.now()
  )
}

export function cachedMessageTranslation(messageId: string, target: string): { text: string; source: string } | null {
  return get<{ text: string; source: string }>("SELECT text, source FROM message_translations WHERE message_id = ? AND target = ?", messageId, target) ?? null
}

export function keepMessageTranslation(messageId: string, target: string, source: string, text: string): void {
  run(
    "INSERT OR REPLACE INTO message_translations (message_id, target, source, text, created_at) VALUES (?, ?, ?, ?, ?)",
    messageId,
    target,
    source,
    text,
    Date.now()
  )
}

// Finds the language of posts and messages that were written before the language was recorded. A few at a time, from the
// background tick, so a large history never holds up the server. A text with no clear language is recorded as "".
export function recordMissingLanguages(limit = 100): void {
  const posts = all<{ id: string; body: string }>("SELECT id, body FROM posts WHERE lang IS NULL LIMIT ?", limit)
  const messages = all<{ id: string; body: string }>("SELECT id, body FROM chat_messages WHERE lang IS NULL LIMIT ?", limit)
  if (posts.length === 0 && messages.length === 0) return
  transaction(() => {
    for (const post of posts) run("UPDATE posts SET lang = ? WHERE id = ?", detectLanguage(post.body) ?? "", post.id)
    for (const message of messages) run("UPDATE chat_messages SET lang = ? WHERE id = ?", detectLanguage(message.body) ?? "", message.id)
  })
}
