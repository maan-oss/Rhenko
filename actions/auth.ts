"use server"

import { after } from "next/server"
import { redirect } from "next/navigation"
import {
  activateAccount,
  adoptRemainingAccount,
  checkSecondFactor,
  clearChallenge,
  clientIp,
  countChallengeFailure,
  createChallenge,
  createSession,
  currentSessionHash,
  destroySession,
  findUserById,
  findUserByHandleWithSecret,
  getViewer,
  hashPassword,
  isUniqueViolation,
  issueEmailCode,
  newId,
  readChallenge,
  redeemEmailCode,
  spendPasswordCheck,
  verifyPassword,
  withdrawEmailCodes,
} from "@/lib/auth"
import { cleanEmail, emailProblem, EMAIL_CODE_MINUTES, MAX_EMAIL, passwordProblem } from "@/lib/account-rules"
import { hangUpFor } from "@/lib/call-state"
import { get, run } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { consume, reached, waitLabel } from "@/lib/rate-limit"
import { HANDLE_MAX, MAX_PASSWORD, ageFrom, validateHandle, validateName } from "@/lib/rules"
import { MINIMUM_AGE, TERMS_VERSION } from "@/lib/legal"
import { emailReady } from "@/lib/settings-data"
import { stampOk, verifyProof } from "@/lib/proof"
import { parseAnswer } from "@/lib/proof-rules"
import { recordSignal } from "@/lib/risk"

// proofRequired tells the form to run the human check again and send the answer with the next try.
export type AuthState = { error?: string; proofRequired?: boolean }
export type ResetRequestState = { error?: string; sent?: boolean; email?: string; proofRequired?: boolean }

// Bots fill in every field, including the one a person never sees, and send forms faster than a person can. Their errors
// say nothing about why they failed, so a bot learns nothing from them.
const UNSENT = "Something went wrong. Refresh the page and try again."
function filledHoneypot(formData: FormData): boolean {
  return String(formData.get("website") ?? "") !== ""
}
const CHECK_FIRST = "Confirm you're a person, then try again."

const MINUTE = 60 * 1000

function cleanHandle(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/^@+/, "")
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const handle = cleanHandle(formData.get("handle"))
  const name = String(formData.get("name") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const birthday = String(formData.get("birthday") ?? "").trim()
  const email = cleanEmail(String(formData.get("email") ?? ""))
  // The box is ticked by the person, never by the form. Its value is what the account records as its acceptance.
  const agreed = formData.get("agree") === "on"
  if (filledHoneypot(formData) || !stampOk(formData.get("stamp"))) return { error: UNSENT }

  const handleError = validateHandle(handle)
  if (handleError) return { error: handleError }
  const nameError = validateName(name)
  if (nameError) return { error: nameError }
  const age = ageFrom(birthday)
  if (age === null) return { error: "Enter your date of birth." }
  if (age < MINIMUM_AGE) return { error: `You must be ${MINIMUM_AGE} or older to join Rhenko.` }
  if (!agreed) return { error: "Tick the box to agree to the Terms of Service and the Privacy Policy." }
  if (email) {
    const problem = emailProblem(email)
    if (problem) return { error: problem }
  }
  const passwordError = passwordProblem(password)
  if (passwordError) return { error: passwordError }

  const taken = "That handle is taken. Try another one."
  const emailTaken = "That email is already used by another account. Use a different one, or leave it blank."
  if (get("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)) return { error: taken }
  if (email && get("SELECT id FROM users WHERE email = ? COLLATE NOCASE", email)) return { error: emailTaken }

  // The human check comes once the fields are right, so a typo does not use up a puzzle.
  const answer = parseAnswer(formData.get("proof"))
  if (!answer || !(await verifyProof(answer))) return { error: CHECK_FIRST, proofRequired: true }

  // Ten new accounts per network each hour. Only a sign-up that is about to succeed counts.
  const limit = consume(`signup:${await clientIp()}`, 10, 60 * MINUTE)
  if (!limit.ok) {
    return { error: `Too many accounts were made from this network in the last hour. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }
  }

  const id = newId()
  const hash = await hashPassword(password)
  try {
    run(
      `INSERT INTO users (id, handle, name, bio, location, website, avatar_file, banner_file, password_hash, created_at, birthday, email, email_verified_at, terms_version, terms_accepted_at, onboarding)
       VALUES (?, ?, ?, '', '', '', NULL, NULL, ?, ?, ?, ?, NULL, ?, ?, 'pending')`,
      id,
      handle,
      name,
      hash,
      Date.now(),
      birthday,
      email || null,
      TERMS_VERSION,
      Date.now()
    )
  } catch (error) {
    if (isUniqueViolation(error, "users.email")) return { error: emailTaken }
    if (isUniqueViolation(error, "users.handle")) return { error: taken }
    throw error
  }
  await recordSignal(id, "signup")
  await createSession(id)
  // A new account first sets where it is, its languages and its interests. Each step can be skipped.
  redirect("/welcome")
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const handle = cleanHandle(formData.get("handle"))
  const password = String(formData.get("password") ?? "")
  if (!handle || !password) return { error: "Enter your handle and password." }
  if (filledHoneypot(formData)) return { error: "Handle or password is wrong." }
  // After three wrong passwords for one handle, or ten from one network, in fifteen minutes, the sign-in needs the human check
  // too. Sign-ins that work are not counted, so a person who signs in often is not asked for it.
  const failures = `loginfail:${handle.toLowerCase().slice(0, 32)}`
  const networkFailures = `loginfailip:${await clientIp()}`
  const checkFirst = reached(failures, 3, 15 * MINUTE) || reached(networkFailures, 10, 15 * MINUTE)

  const ipLimit = consume(`loginip:${await clientIp()}`, 30, 15 * MINUTE)
  if (!ipLimit.ok) {
    return { error: `Too many sign-in attempts from this network. Try again in ${waitLabel(ipLimit.retryAfterSeconds)}.` }
  }
  const handleLimit = consume(`login:${handle.toLowerCase().slice(0, 32)}`, 10, 15 * MINUTE)
  if (!handleLimit.ok) {
    return { error: `Too many sign-in attempts for that handle. Try again in ${waitLabel(handleLimit.retryAfterSeconds)}.` }
  }
  if (checkFirst) {
    const answer = parseAnswer(formData.get("proof"))
    if (!answer || !(await verifyProof(answer))) {
      return { error: "Confirm you're a person to keep signing in.", proofRequired: true }
    }
  }

  // One password check runs whether or not the handle exists, so a failed sign-in takes as long either way.
  const user = handle.length <= HANDLE_MAX ? findUserByHandleWithSecret(handle) : undefined
  let ok = false
  if (user && password.length <= MAX_PASSWORD) ok = await verifyPassword(password, user.password_hash)
  else await spendPasswordCheck(password.slice(0, MAX_PASSWORD))
  if (!user || !ok) {
    // Only a wrong password is counted, for the check above.
    consume(failures, 3, 15 * MINUTE)
    consume(networkFailures, 10, 15 * MINUTE)
    return { error: "Handle or password is wrong." }
  }

  // A deactivated account comes back only after the whole sign-in, so with two-factor on it waits for the code.
  if (user.totp_enabled === 1) {
    await createChallenge(user.id)
    redirect("/login/verify")
  }
  if (user.deactivated_at !== null) run("UPDATE users SET deactivated_at = NULL WHERE id = ?", user.id)
  await recordSignal(user.id, "login")
  await createSession(user.id)
  redirect("/")
}

// Second step: an authenticator code or a one-time recovery code. Five wrong codes end this sign-in.
export async function verifySecondFactor(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const challenge = await readChallenge()
  if (!challenge) redirect("/login?notice=expired")
  const user = findUserById(challenge.userId)
  if (!user || user.totp_enabled !== 1) {
    await clearChallenge()
    redirect("/login?notice=expired")
  }

  const result = checkSecondFactor(user.id, String(formData.get("code") ?? ""))
  if (!result.ok) {
    if (!countChallengeFailure(challenge.tokenHash)) {
      await clearChallenge()
      redirect("/login?notice=codes")
    }
    return { error: result.error }
  }

  await clearChallenge()
  if (user.deactivated_at !== null) run("UPDATE users SET deactivated_at = NULL WHERE id = ?", user.id)
  await createSession(user.id)
  redirect("/")
}

// Logs out the active account. Another remembered account takes over if there is one.
export async function logout(): Promise<void> {
  const viewer = await getViewer()
  if (viewer) hangUpFor(viewer.id, "signed-out", await currentSessionHash())
  await destroySession()
  if (await adoptRemainingAccount()) redirect("/")
  redirect("/login")
}

// Moves this browser to another remembered account. A call the current account is running here ends with the switch.
export async function switchAccount(userId: string): Promise<void> {
  const viewer = await getViewer()
  const before = await currentSessionHash()
  if (!(await activateAccount(userId))) return
  if (viewer && viewer.id !== userId) hangUpFor(viewer.id, "signed-out", before)
  redirect("/")
}

function resetMail(handle: string, code: string): string {
  return [
    `Hi @${handle},`,
    "",
    `Your code to reset your Rhenko password is ${code}. It works for ${EMAIL_CODE_MINUTES} minutes.`,
    "",
    "Enter it on the Reset password page with this email address and a new password.",
    "",
    "If you didn't ask to reset your password, ignore this email. Your password stays the same.",
  ].join("\n")
}

// Sends a reset code when the account has a verified email. The reply is the same whether or not an account
// matched, and the email goes out after the response, so neither the words nor the timing reveal an account.
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  if (!emailReady()) return { error: "Email isn't set up on this server, so passwords can't be reset by email." }
  const value = cleanHandle(formData.get("account"))
  if (!value) return { error: "Enter your handle or email." }
  if (value.length > MAX_EMAIL) return { error: "That's longer than any handle or email. Check it and try again." }
  if (filledHoneypot(formData)) return { error: UNSENT }

  const ipLimit = consume(`resetip:${await clientIp()}`, 10, 60 * MINUTE)
  if (!ipLimit.ok) {
    return { error: `Too many reset requests from this network. Try again in ${waitLabel(ipLimit.retryAfterSeconds)}.` }
  }
  const targetLimit = consume(`reset:${value.toLowerCase()}`, 3, 15 * MINUTE)
  if (!targetLimit.ok) {
    return { error: `Too many reset requests for that handle or email. Try again in ${waitLabel(targetLimit.retryAfterSeconds)}.` }
  }
  // Every reset request sends an email, so each one needs the human check.
  const answer = parseAnswer(formData.get("proof"))
  if (!answer || !(await verifyProof(answer))) return { error: CHECK_FIRST, proofRequired: true }

  const byEmail = value.includes("@")
  const user = get<{ id: string; handle: string; email: string }>(
    byEmail
      ? "SELECT id, handle, email FROM users WHERE email = ? COLLATE NOCASE AND email_verified_at IS NOT NULL"
      : "SELECT id, handle, email FROM users WHERE handle = ? COLLATE NOCASE AND email IS NOT NULL AND email_verified_at IS NOT NULL",
    value
  )
  // At most one code a minute for an account, and five emails an hour to one address.
  if (
    user &&
    consume(`resetmail:${user.id}`, 1, MINUTE).ok &&
    consume(`mailto:${user.email.toLowerCase()}`, 5, 60 * MINUTE).ok
  ) {
    const code = issueEmailCode(user.id, "reset", user.email)
    after(async () => {
      const sent = await sendMail({ to: user.email, subject: "Your Rhenko password reset code", text: resetMail(user.handle, code) })
      if (!sent.ok) withdrawEmailCodes(user.id, "reset")
    })
  }
  return { sent: true, email: byEmail ? value : undefined }
}

// Sets a new password with an emailed code. Every session for the account ends and any sign-in waiting for a
// second step is cleared. Two-factor sign-in stays as it was.
export async function resetPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = cleanEmail(String(formData.get("email") ?? ""))
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "")
  const password = String(formData.get("password") ?? "")
  const emailError = emailProblem(email)
  if (emailError) return { error: emailError }
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from the email." }
  const passwordError = passwordProblem(password)
  if (passwordError) return { error: passwordError }

  const limit = consume(`resetcheck:${await clientIp()}`, 20, 15 * MINUTE)
  if (!limit.ok) return { error: `Too many tries from this network. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }

  // The new password is hashed before the lookup, so an address without an account takes as long as one with.
  const hash = await hashPassword(password)
  const wrong = { error: "That code isn't right, or it has expired. Check the email we sent, or ask for a new code." }
  const user = get<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE email = ? COLLATE NOCASE AND email_verified_at IS NOT NULL",
    email
  )
  if (!user) return wrong
  const result = redeemEmailCode(user.id, "reset", code, (target) => {
    if (target.toLowerCase() !== user.email.toLowerCase()) return false
    run("UPDATE users SET password_hash = ? WHERE id = ?", hash, user.id)
    run("DELETE FROM sessions WHERE user_id = ?", user.id)
    run("DELETE FROM login_challenges WHERE user_id = ?", user.id)
    run("DELETE FROM email_codes WHERE user_id = ? AND purpose = 'reset'", user.id)
    return true
  })
  if (!result.ok || !result.value) return wrong
  redirect("/login?notice=reset")
}
