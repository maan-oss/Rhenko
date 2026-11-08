// Age assurance. An account must show it is an adult before it can post, reply, quote, repost, send a message or upload media.
// Reading, liking and following stay open. The check is a Stripe Identity document check with a live selfie. Rhenko keeps the
// result, when it was checked and the Stripe session id. It keeps no date of birth, document or photo. Stripe redacts the
// session once the result is in.
//
// Stripe's terms do not allow its identity checks to be used on anyone considered a minor or under 16. So this check is not a
// way to tell who is a child at sign-up. An age estimate from a separate provider is still needed for that (see
// docs/lawyer-review.md). Until it is in place, this check is the only proof of age.

import type Stripe from "stripe"
import { get, run } from "@/lib/db"
import { ageGateMessage, isAtLeast, type AgeCheck } from "@/lib/age-rules"
import { MINIMUM_AGE } from "@/lib/legal"
import { stripe } from "@/lib/payments"

// The stored state. Read from the database, not the viewer, so a result that has just come in shows at once.
// idBadge: the person has chosen to show the ID-checked mark. It means nothing unless the check is adult.
export async function ageCheckState(userId: string): Promise<{ check: AgeCheck; checkedAt: number | null; idBadge: boolean }> {
  const row = await get<{ age_check: AgeCheck; age_checked_at: number | null; show_id_badge: number }>(
    "SELECT age_check, age_checked_at, show_id_badge FROM users WHERE id = ?",
    userId
  )
  return { check: row?.age_check ?? "none", checkedAt: row?.age_checked_at ?? null, idBadge: row?.show_id_badge === 1 }
}

// The line to show instead of posting, messaging or uploading, or null when the account may do so. Read from the database.
export async function ageGate(userId: string): Promise<string | null> {
  const { check } = await ageCheckState(userId)
  return ageGateMessage(check)
}

// Starts a check and returns the Stripe link for it. An open check returns its link again, since Stripe's link is short-lived.
// A check Stripe is still reviewing is not replaced, so no second paid check is started: the answer is "processing".
export async function startAgeCheck(
  userId: string,
  returnUrl: string
): Promise<{ url: string } | { adult: true } | { processing: true }> {
  const current = await get<{ age_check: AgeCheck; age_check_session: string | null }>(
    "SELECT age_check, age_check_session FROM users WHERE id = ?",
    userId
  )
  if (!current) throw new Error("No such account.")
  if (current.age_check === "adult") return { adult: true }
  if (current.age_check === "pending" && current.age_check_session) {
    const existing = await stripe().identity.verificationSessions.retrieve(current.age_check_session)
    if (existing.status === "requires_input" && existing.url) return { url: existing.url }
    if (existing.status === "processing" || existing.status === "verified") return { processing: true }
  }
  const session = await stripe().identity.verificationSessions.create({
    type: "document",
    options: { document: { require_matching_selfie: true } },
    return_url: returnUrl,
    metadata: { user_id: userId },
  })
  if (!session.url) throw new Error("The age check did not start. Try again in a moment.")
  await run(
    "UPDATE users SET age_check = 'pending', age_check_session = ? WHERE id = ?",
    session.id,
    userId
  )
  return { url: session.url }
}

// Applies a Stripe Identity event. Only the session the account is waiting on counts; an older session is ignored.
export async function applyAgeCheckEvent(session: Stripe.Identity.VerificationSession): Promise<void> {
  const userId = session.metadata?.user_id
  if (!userId) return
  const row = await get<{ age_check_session: string | null }>("SELECT age_check_session FROM users WHERE id = ?", userId)
  if (!row || row.age_check_session !== session.id) return

  if (session.status === "processing") {
    await run("UPDATE users SET age_check = 'pending' WHERE id = ?", userId)
    return
  }
  if (session.status === "verified") {
    const expanded = await stripe().identity.verificationSessions.retrieve(session.id, { expand: ["verified_outputs"] })
    const dob = expanded.verified_outputs?.dob
    if (!dob || dob.year == null || dob.month == null || dob.day == null) {
      // No date of birth came back, so the check is not decided and the person can try again.
      await run("UPDATE users SET age_check = 'none', age_check_session = NULL WHERE id = ?", userId)
    } else {
      const adult = isAtLeast({ year: dob.year, month: dob.month, day: dob.day }, MINIMUM_AGE, new Date())
      await run(
        "UPDATE users SET age_check = ?, age_checked_at = ?, age_check_session = ? WHERE id = ?",
        adult ? "adult" : "not_adult",
        Date.now(),
        session.id,
        userId
      )
    }
    await redactSession(session.id)
    return
  }
  if (session.status === "requires_input" || session.status === "canceled") {
    // The person can try again: the check is open to them, not decided.
    await run("UPDATE users SET age_check = 'none', age_check_session = NULL WHERE id = ?", userId)
    await redactSession(session.id)
  }
}

// Asks Stripe to delete the personal data it holds for a session. Failures are logged, not raised, so an account can still
// be deleted when Stripe is unreachable.
export async function redactSession(sessionId: string): Promise<void> {
  try {
    await stripe().identity.verificationSessions.redact(sessionId)
  } catch (error) {
    console.error("could not redact age check session", sessionId, error)
  }
}
