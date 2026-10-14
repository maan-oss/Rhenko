// Sarvam AI, the model Sahayak answers with. Server only.
//
// Nothing is sent to Sarvam unless RHENKO_SARVAM_KEY is set. When it is, Sahayak sends the question and the posts it
// replies to (only those the asker can see) to the service, and nothing else. The Privacy Policy names the service, and
// the operator decides whether to turn it on. The key is never logged, and a failure is logged without the text sent.
const DEFAULT_URL = "https://api.sarvam.ai/v1/chat/completions"
const DEFAULT_MODEL = "sarvam-105b"
const TIMEOUT_MS = 20_000
export const SAHAYAK_MAX_TOKENS = 700

export type Message = { role: "system" | "user"; content: string }
export type Answer = { ok: true; text: string } | { ok: false; error: string }

function settings() {
  return {
    key: (process.env.RHENKO_SARVAM_KEY ?? "").trim(),
    url: (process.env.RHENKO_SARVAM_URL ?? "").trim() || DEFAULT_URL,
    model: (process.env.RHENKO_SARVAM_MODEL ?? "").trim() || DEFAULT_MODEL,
  }
}

export function sahayakOn(): boolean {
  return settings().key !== ""
}

// Asks the model for one answer. The reply is plain text; the caller decides what to do with it.
export async function askSarvam(messages: Message[]): Promise<Answer> {
  const { key, url, model } = settings()
  if (!key) return { ok: false, error: "Sahayak isn't set up on this server." }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "api-subscription-key": key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: SAHAYAK_MAX_TOKENS,
        temperature: 0.3,
        reasoning_effort: "low",
        stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error(`[sahayak] Sarvam answered ${response.status}`)
      return { ok: false, error: "The answering service is unavailable." }
    }
    const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] }
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== "string" || text.trim() === "") return { ok: false, error: "The answer was empty." }
    return { ok: true, text: text.trim() }
  } catch (error) {
    console.error("[sahayak] Sarvam did not answer", error instanceof Error ? error.name : "unknown error")
    return { ok: false, error: "The answering service did not respond." }
  }
}
