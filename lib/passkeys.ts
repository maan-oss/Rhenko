// Passkeys and security keys (WebAuthn). A passkey can sign in on its own. A passkey or a security key can also stand in
// for the code from an authenticator app as the second step after a password. Each challenge is kept in a short-lived
// cookie, signed with the server key, and it works once: a challenge the server did not issue, or one already used, is
// refused.
import { timingSafeEqual } from "node:crypto"
import { cookies, headers } from "next/headers"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { all, get, run } from "@/lib/db"
import { keyedHash } from "@/lib/secrets"
import { MAX_PASSKEY_NAME } from "@/lib/rules"

export const PASSKEY_COOKIE = "rhenko_webauthn"
const CHALLENGE_MS = 5 * 60_000

export type PasskeyRow = { id: string; name: string; createdAt: number; lastUsedAt: number | null }

export async function passkeysOf(userId: string): Promise<PasskeyRow[]> {
  return (await all<{ id: string; name: string; created_at: number; last_used_at: number | null }>(
    "SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY created_at ASC",
    userId
  )).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, lastUsedAt: r.last_used_at }))
}

function transportsOf(stored: string): AuthenticatorTransport[] {
  return stored
    .split(",")
    .filter(Boolean)
    .map((t) => t as AuthenticatorTransport)
}

// The site as the browser sees it. RHENKO_PUBLIC_URL is the address people use. Without it the request's own host is used,
// and that works for local runs. A passkey made on one address does not work on another.
export async function relyingParty(): Promise<{ rpID: string; origin: string }> {
  const configured = process.env.RHENKO_PUBLIC_URL?.trim()
  let origin: string
  if (configured) {
    origin = new URL(configured).origin
  } else {
    const h = await headers()
    const trusted = process.env.RHENKO_TRUST_PROXY === "1"
    const host = (trusted ? h.get("x-forwarded-host") : null) ?? h.get("host") ?? "localhost"
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host)
    const proto = (trusted ? h.get("x-forwarded-proto") : null) ?? (local ? "http" : "https")
    origin = `${proto}://${host}`
  }
  const url = new URL(origin)
  return { rpID: url.hostname, origin: url.origin }
}

type Purpose = "register" | "signin" | "second"
type Payload = { c: string; p: Purpose; u: string; e: number }

function sign(body: string): string {
  return keyedHash("passkey-challenge", body)
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

async function issueChallenge(purpose: Purpose, userId: string, challenge: string): Promise<void> {
  const payload: Payload = { c: challenge, p: purpose, u: userId, e: Date.now() + CHALLENGE_MS }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const store = await cookies()
  store.set(PASSKEY_COOKIE, `${body}.${sign(body)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_MS / 1000,
  })
}

// Reads the challenge for one purpose and removes it, so it can't be used twice.
async function takeChallenge(purpose: Purpose): Promise<{ challenge: string; userId: string } | null> {
  const store = await cookies()
  const raw = store.get(PASSKEY_COOKIE)?.value
  store.delete(PASSKEY_COOKIE)
  if (!raw) return null
  const dot = raw.lastIndexOf(".")
  if (dot < 0) return null
  const body = raw.slice(0, dot)
  if (!sameText(raw.slice(dot + 1), sign(body))) return null
  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload
  } catch {
    return null
  }
  if (payload.p !== purpose || payload.e < Date.now()) return null
  return { challenge: payload.c, userId: payload.u }
}

export async function registrationOptions(user: { id: string; handle: string; name: string }) {
  const { rpID } = await relyingParty()
  const existing = await all<{ id: string; transports: string }>("SELECT id, transports FROM passkeys WHERE user_id = ?", user.id)
  const options = await generateRegistrationOptions({
    rpName: "Rhenko",
    rpID,
    userName: user.handle,
    userDisplayName: user.name || user.handle,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: transportsOf(c.transports) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  })
  await issueChallenge("register", user.id, options.challenge)
  return options
}

export async function finishRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pending = await takeChallenge("register")
  if (!pending || pending.userId !== userId) return { ok: false, error: "That took too long. Start again." }
  const { rpID, origin } = await relyingParty()
  let verified
  try {
    verified = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    })
  } catch {
    return { ok: false, error: "That key couldn't be added. Try again." }
  }
  if (!verified.verified || !verified.registrationInfo) return { ok: false, error: "That key couldn't be added. Try again." }
  const { credential } = verified.registrationInfo
  const cleanName = name.replace(/\s+/g, " ").trim().slice(0, MAX_PASSKEY_NAME) || "Passkey"
  await run(
    "INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    credential.id,
    userId,
    Buffer.from(credential.publicKey).toString("base64url"),
    credential.counter,
    (credential.transports ?? []).join(","),
    cleanName,
    Date.now()
  )
  return { ok: true }
}

// Sign-in with a passkey on its own. The key names the account, so no handle is typed. The browser must verify the user
// (a fingerprint, face or PIN), which is what makes the key a complete sign-in.
export async function signInOptions() {
  const { rpID } = await relyingParty()
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: [] })
  await issueChallenge("signin", "", options.challenge)
  return options
}

// The second step for an account that has two-factor on: any key registered to that account will do.
export async function secondStepOptions(userId: string) {
  const keys = await all<{ id: string; transports: string }>("SELECT id, transports FROM passkeys WHERE user_id = ?", userId)
  if (keys.length === 0) return null
  const { rpID } = await relyingParty()
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "discouraged",
    allowCredentials: keys.map((k) => ({ id: k.id, transports: transportsOf(k.transports) })),
  })
  await issueChallenge("second", userId, options.challenge)
  return options
}

// Checks an answer from the browser and returns the account it belongs to. Only the purpose's challenge is accepted.
export async function checkAssertion(
  purpose: "signin" | "second",
  response: AuthenticationResponseJSON,
  expectedUserId: string | null
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const pending = await takeChallenge(purpose)
  if (!pending) return { ok: false, error: "That took too long. Try again." }
  if (expectedUserId !== null && pending.userId !== expectedUserId) return { ok: false, error: "That took too long. Try again." }
  const key = await get<{ id: string; user_id: string; public_key: string; counter: number; transports: string }>(
    "SELECT id, user_id, public_key, counter, transports FROM passkeys WHERE id = ?",
    response.id
  )
  if (!key || (expectedUserId !== null && key.user_id !== expectedUserId)) {
    return { ok: false, error: "That key isn't registered to this account." }
  }
  const { rpID, origin } = await relyingParty()
  let verified
  try {
    verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: key.id,
        publicKey: new Uint8Array(Buffer.from(key.public_key, "base64url")),
        counter: key.counter,
        transports: transportsOf(key.transports),
      },
      requireUserVerification: purpose === "signin",
    })
  } catch {
    return { ok: false, error: "That key didn't work. Try again." }
  }
  if (!verified.verified) return { ok: false, error: "That key didn't work. Try again." }
  const next = verified.authenticationInfo.newCounter
  // Keys that count their use must count upward. A counter that goes back means the key was copied, so it is refused.
  // Synced passkeys report 0 every time, which is allowed.
  if ((next > 0 || key.counter > 0) && next <= key.counter) return { ok: false, error: "That key didn't work. Try again." }
  await run("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?", next, Date.now(), key.id)
  return { ok: true, userId: key.user_id }
}
