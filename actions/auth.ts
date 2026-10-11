"use server"

import { redirect } from "next/navigation"
import { createSession, destroySession, findUserByHandleWithSecret, hashPassword, newId, verifyPassword } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { MAX_PASSWORD, MIN_PASSWORD, validateHandle, validateName } from "@/lib/rules"

export type AuthState = { error?: string }

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const handle = String(formData.get("handle") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  const handleError = validateHandle(handle)
  if (handleError) return { error: handleError }
  const nameError = validateName(name)
  if (nameError) return { error: nameError }
  if (password.length < MIN_PASSWORD) return { error: `Passwords need at least ${MIN_PASSWORD} characters.` }
  if (password.length > MAX_PASSWORD) return { error: `Passwords can have up to ${MAX_PASSWORD} characters.` }

  const taken = get<{ id: string }>("SELECT id FROM users WHERE handle = ? COLLATE NOCASE", handle)
  if (taken) return { error: "That handle is taken." }

  const id = newId()
  const hash = await hashPassword(password)
  try {
    run(
      `INSERT INTO users (id, handle, name, bio, location, website, avatar_file, banner_file, password_hash, created_at)
       VALUES (?, ?, ?, '', '', '', NULL, NULL, ?, ?)`,
      id,
      handle,
      name,
      hash,
      Date.now()
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
  await createSession(user.id)
  redirect("/")
}

export async function logout(): Promise<void> {
  await destroySession()
  redirect("/login")
}
