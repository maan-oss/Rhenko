"use server"

import { revalidatePath } from "next/cache"
import QRCode from "qrcode"
import { redirect } from "next/navigation"
import {
  adoptRemainingAccount,
  checkSecondFactor,
  currentSessionHash,
  destroySession,
  getAgreedViewer,
  getViewer,
  hashPassword,
  isUniqueViolation,
  issueEmailCode,
  pendingEmailCode,
  readTotpSecret,
  redeemEmailCode,
  replaceRecoveryCodes,
  requireAgreedViewer,
  runChanges,
  secondFactorState,
  verifyPassword,
  withdrawEmailCodes,
  type RedeemResult,
} from "@/lib/auth"
import {
  cleanEmail,
  cleanStatus,
  emailProblem,
  EMAIL_CODE_MINUTES,
  passwordProblem,
  sameEmail,
  statusProblem,
} from "@/lib/account-rules"
import { hangUpFor } from "@/lib/call-state"
import { releaseCirclesOf } from "@/lib/circles"
import { endSubscriptionsAtPeriodEnd } from "@/lib/payments"
import { all, get, run, transaction } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { mediaFilesFor, removeFiles, treeOfAuthor } from "@/lib/post-writes"
import { consume, waitLabel } from "@/lib/rate-limit"
import { encryptText } from "@/lib/secrets"
import { emailReady, NOTIFICATION_KINDS } from "@/lib/settings-data"
import { generateRecoveryCodes, generateSecret, matchTotp, normalizeAppCode, otpauthUri } from "@/lib/totp"

export type AccountState = { ok?: boolean; error?: string }
export type SetupResult = { ok: true; secret: string; qr: string; uri: string } | { ok: false; error: string }
export type CodesResult = { ok: true; codes: string[] } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }
export type StatusState = { ok?: boolean; error?: string; status?: string }
export type EmailState = { ok?: boolean; error?: string; sentTo?: string; email?: string | null; verified?: boolean }

const MINUTE = 60 * 1000
const WRONG_PASSWORD = "That isn't your current password. Check it and try again."

function refresh() {
  revalidatePath("/", "layout")
}

async function checkPassword(userId: string, password: string): Promise<boolean> {
  const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", userId)
  if (!row) return false
  return await verifyPassword(password, row.password_hash)
}

// Ten password or code checks per account every 15 minutes, so a session left open somewhere can't be used to guess.
async function identityLimit(userId: string): Promise<string | null> {
  const limit = await consume(`confirm:${userId}`, 10, 15 * MINUTE)
  return limit.ok ? null : `Too many tries. Wait ${waitLabel(limit.retryAfterSeconds)}, then try again.`
}

// Sensitive changes ask for the password, and for a code while two-factor sign-in is on: one from the authenticator
// app or a recovery code. Returns what went wrong, or null when both check out.
async function confirmIdentity(userId: string, formData: FormData, needs: { code?: boolean } = {}): Promise<string | null> {
  const limited = await identityLimit(userId)
  if (limited) return limited
  if (!(await checkPassword(userId, String(formData.get("password") ?? "")))) return WRONG_PASSWORD
  if (needs.code !== false && (await secondFactorState(userId)).enabled) {
    const check = await checkSecondFactor(userId, String(formData.get("code") ?? ""))
    if (!check.ok) return check.error
  }
  return null
}

export async function changePassword(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await requireAgreedViewer()
  const current = String(formData.get("current") ?? "")
  const next = String(formData.get("next") ?? "")
  const limited = await identityLimit(viewer.id)
  if (limited) return { error: limited }
  if (!(await checkPassword(viewer.id, current))) return { error: WRONG_PASSWORD }
  const problem = passwordProblem(next)
  if (problem) return { error: problem }
  if (next === current) return { error: "Choose a new password that's different from the current one." }
  const hash = await hashPassword(next)
  const keep = await currentSessionHash()
  await transaction(async () => {
    await run("UPDATE users SET password_hash = ? WHERE id = ?", hash, viewer.id)
    // Every other signed-in device has to sign in again, and sign-ins waiting for a code start over.
    await run("DELETE FROM sessions WHERE user_id = ? AND token_hash IS DISTINCT FROM ?", viewer.id, keep)
    await run("DELETE FROM login_challenges WHERE user_id = ?", viewer.id)
  })
  return { ok: true }
}

export async function revokeSession(tokenHash: string): Promise<VoidResult> {
  const viewer = await requireAgreedViewer()
  if (typeof tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(tokenHash)) {
    return { ok: false, error: "That device isn't in the list any more. Reload the page." }
  }
  const keep = await currentSessionHash()
  if (tokenHash === keep) return { ok: false, error: "That's this device. Log out to end it." }
  await run("DELETE FROM sessions WHERE user_id = ? AND token_hash = ?", viewer.id, tokenHash)
  refresh()
  return { ok: true }
}

export async function revokeOtherSessions(): Promise<VoidResult> {
  const viewer = await requireAgreedViewer()
  const keep = await currentSessionHash()
  await run("DELETE FROM sessions WHERE user_id = ? AND token_hash IS DISTINCT FROM ?", viewer.id, keep)
  refresh()
  return { ok: true }
}

// Starts two-factor setup. The secret is stored encrypted and stays off until a code checks out.
export async function beginTotpSetup(): Promise<SetupResult> {
  const viewer = await requireAgreedViewer()
  if (viewer.totpEnabled) return { ok: false, error: "Two-factor sign-in is already on." }
  const secret = generateSecret()
  await run("UPDATE users SET totp_secret = ?, totp_step = 0 WHERE id = ? AND totp_enabled = 0", encryptText(secret), viewer.id)
  const uri = otpauthUri(secret, viewer.handle)
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 224, color: { dark: "#0b0b0c", light: "#ffffff" } })
  return { ok: true, secret, qr, uri }
}

export async function enableTotp(_prev: AccountState, formData: FormData): Promise<CodesResult> {
  const viewer = await requireAgreedViewer()
  const row = await get<{ totp_secret: string | null; totp_enabled: number }>(
    "SELECT totp_secret, totp_enabled FROM users WHERE id = ?",
    viewer.id
  )
  if (!row) return { ok: false, error: "Sign in first." }
  if (row.totp_enabled === 1) return { ok: false, error: "Two-factor sign-in is already on." }
  const secret = readTotpSecret(row.totp_secret)
  if (!secret) return { ok: false, error: "This setup can't be finished. Start again with Turn on two-factor sign-in." }
  const code = normalizeAppCode(String(formData.get("code") ?? ""))
  if (!code) return { ok: false, error: "Enter the 6-digit code your authenticator app shows." }
  const step = matchTotp(secret, code, 0)
  if (step === null) {
    return { ok: false, error: "That code isn't right. Check that your phone sets its time automatically, then enter the code showing now." }
  }
  const { plain, hashes } = generateRecoveryCodes()
  const enabled = await transaction(async () => {
    const changed = await runChanges(
      "UPDATE users SET totp_enabled = 1, totp_step = ?, totp_secret = ? WHERE id = ? AND totp_enabled = 0 AND totp_secret = ?",
      step,
      encryptText(secret),
      viewer.id,
      row.totp_secret
    )
    if (changed !== 1) return false
    await replaceRecoveryCodes(viewer.id, hashes)
    return true
  })
  if (!enabled) return { ok: false, error: "Setup started again in another window. Use the newest QR code, or start over here." }
  refresh()
  return { ok: true, codes: plain }
}

export async function disableTotp(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await requireAgreedViewer()
  const state = await secondFactorState(viewer.id)
  if (!state.enabled) return { error: "Two-factor sign-in is already off." }
  // When the server can't read the authenticator key and no recovery codes are left, there is no code anyone could
  // give, so the password alone turns it off.
  const stuck = !state.usable && state.recoveryLeft === 0
  const denied = await confirmIdentity(viewer.id, formData, { code: !stuck })
  if (denied) return { error: denied }
  await transaction(async () => {
    await run("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_step = 0 WHERE id = ?", viewer.id)
    await run("DELETE FROM recovery_codes WHERE user_id = ?", viewer.id)
  })
  refresh()
  return { ok: true }
}

export async function regenerateRecoveryCodes(_prev: AccountState, formData: FormData): Promise<CodesResult> {
  const viewer = await requireAgreedViewer()
  const state = await secondFactorState(viewer.id)
  if (!state.enabled) return { ok: false, error: "Turn on two-factor sign-in first." }
  if (!state.usable && state.recoveryLeft === 0) {
    return { ok: false, error: "Turn two-factor sign-in off, then on again, to get a new key and new recovery codes." }
  }
  const denied = await confirmIdentity(viewer.id, formData)
  if (denied) return { ok: false, error: denied }
  const { plain, hashes } = generateRecoveryCodes()
  await transaction(async () => await replaceRecoveryCodes(viewer.id, hashes))
  refresh()
  return { ok: true, codes: plain }
}

export async function setNotificationPref(kind: string, enabled: boolean): Promise<VoidResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof kind !== "string" || !(NOTIFICATION_KINDS as readonly string[]).includes(kind) || typeof enabled !== "boolean") {
    return { ok: false, error: "That setting isn't available. Reload the page and try again." }
  }
  await run(
    `INSERT INTO notification_prefs (user_id, kind, enabled) VALUES (?, ?, ?)
     ON CONFLICT (user_id, kind) DO UPDATE SET enabled = excluded.enabled`,
    viewer.id,
    kind,
    enabled ? 1 : 0
  )
  refresh()
  return { ok: true }
}

// A short line beside your name. Blank clears it.
export async function setStatus(_prev: StatusState, formData: FormData): Promise<StatusState> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in first." }
  const status = cleanStatus(String(formData.get("status") ?? ""))
  const problem = statusProblem(status)
  if (problem) return { error: problem }
  await run("UPDATE users SET status = ? WHERE id = ?", status, viewer.id)
  refresh()
  return { ok: true, status }
}

function verifyMail(handle: string, code: string): string {
  return [
    `Hi @${handle},`,
    "",
    `Your Rhenko verification code is ${code}. It works for ${EMAIL_CODE_MINUTES} minutes.`,
    "",
    "Enter it in Settings, under Account, to confirm this email address.",
    "",
    "If you didn't ask for this, ignore this email. Without the code, this address can't be confirmed on Rhenko.",
  ].join("\n")
}

// Sends a six-digit code to confirm an email address. Adding or changing the address asks for the password, and a
// two-factor code while that is on; confirming the address already on the account, or sending a fresh code to an
// address waiting for one, doesn't. One code a minute per account, and five emails an hour to one address.
export async function sendEmailCode(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const viewer = await requireAgreedViewer()
  if (!emailReady()) return { error: "Email isn't set up on this server, so codes can't be sent." }
  const email = cleanEmail(String(formData.get("email") ?? ""))
  const problem = emailProblem(email)
  if (problem) return { error: problem }
  const current = await get<{ email: string | null; email_verified_at: number | null }>(
    "SELECT email, email_verified_at FROM users WHERE id = ?",
    viewer.id
  )
  if (!current) return { error: "Sign in first." }

  const confirmingCurrent = sameEmail(current.email, email)
  if (confirmingCurrent && current.email_verified_at !== null) return { error: "That address is already verified on your account." }
  const target = confirmingCurrent && current.email ? current.email : email
  if (!confirmingCurrent) {
    const taken = await get(
      "SELECT 1 AS found FROM users WHERE email = ? AND email_verified_at IS NOT NULL AND id <> ?",
      email,
      viewer.id
    )
    if (taken) return { error: "That email is already used by another account. Use a different one." }
    const resending = sameEmail((await pendingEmailCode(viewer.id, "verify"))?.target, email)
    if (!resending) {
      const denied = await confirmIdentity(viewer.id, formData)
      if (denied) return { error: denied }
    }
  }

  const perAccount = await consume(`verifymail:${viewer.id}`, 1, MINUTE)
  if (!perAccount.ok) {
    return { error: `A code went out less than a minute ago. Wait ${waitLabel(perAccount.retryAfterSeconds)} before sending another.` }
  }
  const perAddress = await consume(`mailto:${target.toLowerCase()}`, 5, 60 * MINUTE)
  if (!perAddress.ok) {
    return { error: `That address has had five codes this hour. Try again in ${waitLabel(perAddress.retryAfterSeconds)}.` }
  }
  const code = await issueEmailCode(viewer.id, "verify", target)
  const sent = await sendMail({ to: target, subject: "Your Rhenko verification code", text: verifyMail(viewer.handle, code) })
  if (!sent.ok) {
    await withdrawEmailCodes(viewer.id, "verify")
    return { error: sent.error }
  }
  return { ok: true, sentTo: target }
}

// Confirms the emailed code. The address it went to becomes the account's verified email.
export async function confirmEmail(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const viewer = await requireAgreedViewer()
  let result: RedeemResult<string>
  try {
    result = await redeemEmailCode(viewer.id, "verify", String(formData.get("code") ?? ""), async (target) => {
      // An account that never proved this address was its own gives it up to the one that just did.
      await run("UPDATE users SET email = NULL WHERE email = ? AND email_verified_at IS NULL AND id <> ?", target, viewer.id)
      await run("UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?", target, Date.now(), viewer.id)
      // Reset codes went to the old address.
      await run("DELETE FROM email_codes WHERE user_id = ? AND purpose = 'reset'", viewer.id)
      return target
    })
  } catch (error) {
    if (isUniqueViolation(error, "users.email")) return { error: "That email is already used by another account. Use a different one." }
    throw error
  }
  if (!result.ok) {
    if (result.reason === "wrong") {
      return { error: `That code isn't right. ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left.` }
    }
    if (result.reason === "spent") return { error: "That code had too many wrong tries. Send a new one." }
    return { error: "That code has expired. Send a new one." }
  }
  refresh()
  return { ok: true, email: result.value, verified: true }
}

// Drops a code that is waiting, so a different address can be entered.
export async function cancelEmailCode(): Promise<VoidResult> {
  const viewer = await requireAgreedViewer()
  await withdrawEmailCodes(viewer.id, "verify")
  refresh()
  return { ok: true }
}

export async function removeEmail(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const viewer = await requireAgreedViewer()
  const current = await get<{ email: string | null }>("SELECT email FROM users WHERE id = ?", viewer.id)
  if (!current?.email) return { error: "There's no email on your account to remove." }
  const denied = await confirmIdentity(viewer.id, formData)
  if (denied) return { error: denied }
  await transaction(async () => {
    await run("UPDATE users SET email = NULL, email_verified_at = NULL WHERE id = ?", viewer.id)
    await run("DELETE FROM email_codes WHERE user_id = ?", viewer.id)
    // The daily digest goes only to a confirmed address, so it turns off with it; a new address starts from the switch again.
    await run("UPDATE email_digests SET enabled = 0 WHERE user_id = ?", viewer.id)
  })
  refresh()
  return { ok: true, email: null, verified: false }
}

// Deactivating and deleting stay open to an account that has not agreed to the current Terms (getViewer, not
// requireAgreedViewer): leaving, and taking your data off the service, must not depend on accepting new terms.
export async function deactivateAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  const denied = await confirmIdentity(viewer.id, formData)
  if (denied) return { error: denied }
  await hangUpFor(viewer.id, "deactivated")
  // Paid subscriptions end when the period already paid for ends. Nothing is charged for an account that is hidden. If Stripe
  // cannot be asked, the account stays as it is, so the subscription is not left renewing unseen.
  try {
    await endSubscriptionsAtPeriodEnd(viewer.id)
  } catch (error) {
    console.error("could not end subscriptions before deactivating an account", error)
    return { error: "Your subscription could not be ended right now, so the account was not deactivated. Try again in a moment." }
  }
  await transaction(async () => {
    await run("UPDATE users SET deactivated_at = ? WHERE id = ?", Date.now(), viewer.id)
    await run("DELETE FROM sessions WHERE user_id = ?", viewer.id)
    await run("DELETE FROM login_challenges WHERE user_id = ?", viewer.id)
  })
  await destroySession()
  if (await adoptRemainingAccount()) redirect("/")
  redirect("/login?notice=deactivated")
}

export async function deleteAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  const typed = String(formData.get("confirm") ?? "").trim().replace(/^@+/, "")
  if (typed.toLowerCase() !== viewer.handle.toLowerCase()) return { error: `Type @${viewer.handle} in the box to confirm.` }
  const denied = await confirmIdentity(viewer.id, formData)
  if (denied) return { error: denied }
  // A paid subscription must stop renewing before the account and its billing record are removed. If Stripe cannot be asked,
  // the account is kept, so nobody is charged for an account that no longer exists.
  try {
    await endSubscriptionsAtPeriodEnd(viewer.id)
  } catch (error) {
    console.error("could not end subscriptions before deleting an account", error)
    return { error: "Your subscription could not be ended right now, so the account was not deleted. Try again in a moment." }
  }
  await eraseAccount(viewer.id)
  await destroySession()
  if (await adoptRemainingAccount()) redirect("/")
  redirect("/signup?notice=deleted")
}

// Deletes an account, every session it has, and every file it owns: media in its posts and in the replies under
// them, photos it sent in messages, and its profile photo and banner. Everything that has to end with an account is
// ended here, in one place, before its rows go.
async function eraseAccount(userId: string): Promise<void> {
  await hangUpFor(userId, "deleted")
  const files = await transaction(async () => {
    const postFiles = await mediaFilesFor(await treeOfAuthor(userId))
    const messageFiles = (await all<{ media_file: string }>(
      "SELECT media_file FROM chat_messages WHERE sender_id = ? AND media_file IS NOT NULL",
      userId
    )).map((row) => row.media_file)
    const profile = await get<{ avatar_file: string | null; banner_file: string | null }>(
      "SELECT avatar_file, banner_file FROM users WHERE id = ?",
      userId
    )
    // Circles the account owns pass on or close before its row goes, so none is left without an owner.
    const circleFiles = await releaseCirclesOf(userId)
    await run("DELETE FROM sessions WHERE user_id = ?", userId)
    await run("DELETE FROM passkeys WHERE user_id = ?", userId)
    await run("DELETE FROM users WHERE id = ?", userId)
    return [...postFiles, ...messageFiles, ...circleFiles, profile?.avatar_file ?? null, profile?.banner_file ?? null]
  })
  await removeFiles(files.filter((file): file is string => file !== null))
}
