"use server"

import { revalidatePath } from "next/cache"
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server"
import { clearChallenge, clientIp, createSession, findUserById, getViewer, readChallenge } from "@/lib/auth"
import { run, get } from "@/lib/db"
import { checkAssertion, finishRegistration, registrationOptions, secondStepOptions, signInOptions } from "@/lib/passkeys"
import { consume, waitLabel } from "@/lib/rate-limit"
import { MAX_PASSKEY_NAME, MAX_PASSKEYS } from "@/lib/rules"

type VoidResult = { ok: true } | { ok: false; error: string }
type OptionsResult<T> = { ok: true; options: T } | { ok: false; error: string }

const MINUTE = 60_000

function refresh() {
  revalidatePath("/settings/security")
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200
}

// Adding a key is limited per account, so a stolen session can't fill the account with keys.
export async function startPasskeyRegistration(): Promise<OptionsResult<Awaited<ReturnType<typeof registrationOptions>>>> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?", viewer.id))?.n ?? 0
  if (count >= MAX_PASSKEYS) return { ok: false, error: `You can keep up to ${MAX_PASSKEYS} passkeys and security keys.` }
  const allowed = await consume(`passkey-add:${viewer.id}`, 10, 60 * MINUTE)
  if (!allowed.ok) return { ok: false, error: `Try again in ${waitLabel(allowed.retryAfterSeconds)}.` }
  const options = await registrationOptions({ id: viewer.id, handle: viewer.handle, name: viewer.name })
  return { ok: true, options }
}

export async function finishPasskeyRegistration(response: RegistrationResponseJSON, name: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof name !== "string" || name.length > MAX_PASSKEY_NAME * 4) return { ok: false, error: "Give the key a shorter name." }
  const result = await finishRegistration(viewer.id, response, name)
  refresh()
  return result
}

export async function removePasskey(id: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!isId(id)) return { ok: false, error: "That key is already gone." }
  await run("DELETE FROM passkeys WHERE id = ? AND user_id = ?", id, viewer.id)
  refresh()
  return { ok: true }
}

// Sign-in with a passkey. Each attempt is limited per network, like a password sign-in.
export async function startPasskeySignIn(): Promise<OptionsResult<Awaited<ReturnType<typeof signInOptions>>>> {
  const limit = await consume(`passkey-signin:${await clientIp()}`, 30, 15 * MINUTE)
  if (!limit.ok) return { ok: false, error: `Too many sign-in attempts from this network. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }
  return { ok: true, options: await signInOptions() }
}

export async function finishPasskeySignIn(response: AuthenticationResponseJSON): Promise<VoidResult> {
  const limit = await consume(`passkey-signin:${await clientIp()}`, 30, 15 * MINUTE)
  if (!limit.ok) return { ok: false, error: "Too many sign-in attempts from this network. Try again later." }
  const result = await checkAssertion("signin", response, null)
  if (!result.ok) return result
  const user = await findUserById(result.userId)
  if (!user) return { ok: false, error: "That key isn't registered to an account." }
  if (user.deactivated_at !== null) await run("UPDATE users SET deactivated_at = NULL WHERE id = ?", user.id)
  await createSession(user.id)
  return { ok: true }
}

// The second step after a password, for an account with two-factor on. It answers the same challenge as a code.
export async function startPasskeySecondStep(): Promise<OptionsResult<NonNullable<Awaited<ReturnType<typeof secondStepOptions>>>>> {
  const challenge = await readChallenge()
  if (!challenge) return { ok: false, error: "That sign-in has expired. Log in again." }
  const options = await secondStepOptions(challenge.userId)
  if (!options) return { ok: false, error: "This account has no passkey or security key. Enter a code instead." }
  return { ok: true, options }
}

export async function finishPasskeySecondStep(response: AuthenticationResponseJSON): Promise<VoidResult> {
  const challenge = await readChallenge()
  if (!challenge) return { ok: false, error: "That sign-in has expired. Log in again." }
  const user = await findUserById(challenge.userId)
  if (!user || user.totp_enabled !== 1) {
    await clearChallenge()
    return { ok: false, error: "That sign-in has expired. Log in again." }
  }
  const result = await checkAssertion("second", response, user.id)
  if (!result.ok) return result
  await clearChallenge()
  if (user.deactivated_at !== null) await run("UPDATE users SET deactivated_at = NULL WHERE id = ?", user.id)
  await createSession(user.id)
  return { ok: true }
}
