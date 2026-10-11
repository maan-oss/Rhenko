"use server"

import { redirect } from "next/navigation"
import {
  challengedUserId,
  clearChallenge,
  createChallenge,
  createSession,
  destroySession,
  findUserById,
  findUserByHandleWithSecret,
  hashPassword,
  newId,
  verifyPassword,
} from "@/lib/auth"
import { get, run, transaction } from "@/lib/db"
import { hashRecoveryCode, matchTotp } from "@/lib/totp"
import { MAX_PASSWORD, MIN_PASSWORD, ageFrom, validateHandle, validateName } from "@/lib/rules"

export type AuthState = { error?: string }

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const handle = String(formData.get("handle") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const birthday = String(formData.get("birthday") ?? "").trim()

  const handleError = validateHandle(handle)
  if (handleError) return { error: handleError }
  const nameError = validateName(name)
  if (nameError) return { error: nameError }
  const age = ageFrom(birthday)
  if (age === null) return { error: "Enter your date of birth." }
  if (age < 13) return { error: "You must be at least 13 to join Rhenko." }
  if (password.length < MIN_PASSWORD) return { error: `Passwords need at least ${MIN_PASSWORD} characters.` }
  if (password.length > MAX_PASSWORD) return { error: `Passwords can have up to ${MAX_PASSWORD} characters.` }

  const taken = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)
  if (taken) return { error: "That handle is taken." }

  const id = newId()
  const hash = await hashPassword(password)
  try {
    run(
      `INSERT INTO users (id, handle, name, bio, location, website, avatar_file, banner_file, password_hash, created_at, birthday)
       VALUES (?, ?, ?, '', '', '', NULL, NULL, ?, ?, ?)`,
      id,
      handle,
      name,
      hash,
      Date.now(),
      birthday
    )
  } catch {
    return { error: "That handle is taken." }
  }
  await createSession(id)
  redirect("/")
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const handle = String(formData.get("handle") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const user = handle ? findUserByHandleWithSecret(handle) : undefined
  const ok = user ? await verifyPassword(password, user.password_hash) : false
  if (!user || !ok) return { error: "Handle or password is wrong." }

  // Signing in to a deactivated account reactivates it.
  if (user.deactivated_at !== null) run("UPDATE users SET deactivated_at = NULL WHERE id = ?", user.id)

  if (user.totp_enabled === 1) {
    await createChallenge(user.id)
    redirect("/login/verify")
  }
  await createSession(user.id)
  redirect("/")
}

// Second step: an authenticator code or a one-time recovery code.
export async function verifySecondFactor(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const userId = await challengedUserId()
  if (!userId) return { error: "Sign in again to continue." }
  const user = findUserById(userId)
  if (!user || user.totp_enabled !== 1 || !user.totp_secret) return { error: "Sign in again to continue." }

  const code = String(formData.get("code") ?? "").trim()
  if (code.includes("-")) {
    const hash = hashRecoveryCode(code)
    const used = transaction(() => {
      const row = get<{ id: string }>(
        "SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL",
        user.id,
        hash
      )
      if (!row) return false
      run("UPDATE recovery_codes SET used_at = ? WHERE id = ?", Date.now(), row.id)
      return true
    })
    if (!used) return { error: "That recovery code isn't valid." }
  } else {
    const step = matchTotp(user.totp_secret, code, user.totp_step)
    if (step === null) return { error: "That code isn't right. Codes change every 30 seconds." }
    run("UPDATE users SET totp_step = ? WHERE id = ?", step, user.id)
  }

  await clearChallenge()
  await createSession(user.id)
  redirect("/")
}

export async function logout(): Promise<void> {
  await destroySession()
  redirect("/login")
}
