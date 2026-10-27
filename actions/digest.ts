"use server"

import { revalidatePath } from "next/cache"
import { getAgreedViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { digestAvailable, saveDigestChoice } from "@/lib/digest"
import { asDigestHour, DIGEST_NEEDS_EMAIL, DIGEST_NOT_SET_UP } from "@/lib/digest-rules"
import { consume, waitLabel } from "@/lib/rate-limit"

// The daily email digest switch and its hour, from Settings → Notifications. Turning it off from a link in the email is
// a route (app/api/digest/unsubscribe), because that has no sign-in.

type VoidResult = { ok: true } | { ok: false; error: string }

const HOUR_MS = 60 * 60 * 1000

// Turns the digest on at `hour` (0 to 23, UTC), or off. It goes only to a confirmed address. 30 changes an hour per account.
export async function setEmailDigest(on: unknown, hour: unknown): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const chosenHour = asDigestHour(hour)
  if (typeof on !== "boolean" || chosenHour === null) return { ok: false, error: "That setting isn't available. Reload the page and try again." }
  const limit = await consume(`digest-set:${viewer.id}`, 30, HOUR_MS)
  if (!limit.ok) return { ok: false, error: `You've changed that a lot. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }
  if (on) {
    if (!digestAvailable()) return { ok: false, error: DIGEST_NOT_SET_UP }
    const row = await get<{ email: string | null; email_verified_at: number | null }>(
      "SELECT email, email_verified_at FROM users WHERE id = ?",
      viewer.id
    )
    if (!row?.email || row.email_verified_at === null) return { ok: false, error: DIGEST_NEEDS_EMAIL }
  }
  await saveDigestChoice(viewer.id, on, chosenHour)
  revalidatePath("/settings/notifications")
  return { ok: true }
}
