"use server"

import { revalidatePath } from "next/cache"
import QRCode from "qrcode"
import { redirect } from "next/navigation"
import { currentSessionHash, destroySession, getViewer, hashPassword, newId, verifyPassword } from "@/lib/auth"
import { get, run, transaction } from "@/lib/db"
import { mediaFilesFor, removeFiles, treeOfAuthor } from "@/lib/post-writes"
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/rules"
import { generateRecoveryCodes, generateSecret, matchTotp, otpauthUri } from "@/lib/totp"
import { removeUpload } from "@/lib/uploads"

export type AccountState = { ok?: boolean; error?: string }
export type SetupResult = { ok: true; secret: string; qr: string; uri: string } | { ok: false; error: string }
export type CodesResult = { ok: true; codes: string[] } | { ok: false; error: string }
export type VoidResult = { ok: true } | { ok: false; error: string }

const NOTIFICATION_KINDS = ["like", "repost", "reply", "quote", "follow", "mention", "follow_request", "poll"] as const

function refresh() {
  revalidatePath("/", "layout")
}

async function checkPassword(userId: string, password: string): Promise<boolean> {
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", userId)
  if (!row) return false
  return verifyPassword(password, row.password_hash)
}

export async function changePassword(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  const current = String(formData.get("current") ?? "")
  const next = String(formData.get("next") ?? "")
  if (!(await checkPassword(viewer.id, current))) return { error: "Your current password is wrong." }
  if (next.length < MIN_PASSWORD) return { error: `Passwords need at least ${MIN_PASSWORD} characters.` }
  if (next.length > MAX_PASSWORD) return { error: `Passwords can have up to ${MAX_PASSWORD} characters.` }
  if (next === current) return { error: "Choose a password you haven't used here." }
  const hash = await hashPassword(next)
  const keep = await currentSessionHash()
  transaction(() => {
    run("UPDATE users SET password_hash = ? WHERE id = ?", hash, viewer.id)
    // Every other signed-in device has to sign in again.
    run("DELETE FROM sessions WHERE user_id = ? AND token_hash IS NOT ?", viewer.id, keep)
  })
  return { ok: true }
}

export async function revokeSession(tokenHash: string): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const keep = await currentSessionHash()
  if (tokenHash === keep) return { ok: false, error: "That's this device. Log out to end it." }
  run("DELETE FROM sessions WHERE user_id = ? AND token_hash = ?", viewer.id, tokenHash)
  refresh()
  return { ok: true }
}

export async function revokeOtherSessions(): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const keep = await currentSessionHash()
  run("DELETE FROM sessions WHERE user_id = ? AND token_hash IS NOT ?", viewer.id, keep)
  refresh()
  return { ok: true }
}

// Starts two-factor setup. The secret is saved but stays off until a code checks out.
export async function beginTotpSetup(): Promise<SetupResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (viewer.totpEnabled) return { ok: false, error: "Two-factor sign-in is already on." }
  const secret = generateSecret()
  run("UPDATE users SET totp_secret = ?, totp_step = 0 WHERE id = ?", secret, viewer.id)
  const uri = otpauthUri(secret, viewer.handle)
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 224, color: { dark: "#0b0b0c", light: "#ffffff" } })
  return { ok: true, secret, qr, uri }
}

export async function enableTotp(_prev: AccountState, formData: FormData): Promise<CodesResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const user = get<{ totp_secret: string | null; totp_enabled: number }>("SELECT totp_secret, totp_enabled FROM users WHERE id = ?", viewer.id)
  if (!user?.totp_secret) return { ok: false, error: "Start setup again." }
  if (user.totp_enabled === 1) return { ok: false, error: "Two-factor sign-in is already on." }
  const step = matchTotp(user.totp_secret, String(formData.get("code") ?? "").trim(), 0)
  if (step === null) return { ok: false, error: "That code isn't right. Check the time on your device and try again." }
  const { plain, hashes } = generateRecoveryCodes()
  transaction(() => {
    run("UPDATE users SET totp_enabled = 1, totp_step = ? WHERE id = ?", step, viewer.id)
    run("DELETE FROM recovery_codes WHERE user_id = ?", viewer.id)
    for (const hash of hashes) run("INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)", newId(), viewer.id, hash)
  })
  refresh()
  return { ok: true, codes: plain }
}

export async function disableTotp(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  if (!(await checkPassword(viewer.id, String(formData.get("password") ?? "")))) return { error: "Your password is wrong." }
  const user = get<{ totp_secret: string | null; totp_step: number }>("SELECT totp_secret, totp_step FROM users WHERE id = ?", viewer.id)
  const code = String(formData.get("code") ?? "").trim()
  if (!user?.totp_secret || matchTotp(user.totp_secret, code, user.totp_step) === null) {
    return { error: "That code isn't right." }
  }
  transaction(() => {
    run("UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_step = 0 WHERE id = ?", viewer.id)
    run("DELETE FROM recovery_codes WHERE user_id = ?", viewer.id)
  })
  refresh()
  return { ok: true }
}

export async function regenerateRecoveryCodes(_prev: AccountState, formData: FormData): Promise<CodesResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!viewer.totpEnabled) return { ok: false, error: "Turn on two-factor sign-in first." }
  if (!(await checkPassword(viewer.id, String(formData.get("password") ?? "")))) return { ok: false, error: "Your password is wrong." }
  const { plain, hashes } = generateRecoveryCodes()
  transaction(() => {
    run("DELETE FROM recovery_codes WHERE user_id = ?", viewer.id)
    for (const hash of hashes) run("INSERT INTO recovery_codes (id, user_id, code_hash) VALUES (?, ?, ?)", newId(), viewer.id, hash)
  })
  return { ok: true, codes: plain }
}

export async function setNotificationPref(kind: string, enabled: boolean): Promise<VoidResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (!(NOTIFICATION_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "Unknown notification type." }
  run(
    `INSERT INTO notification_prefs (user_id, kind, enabled) VALUES (?, ?, ?)
     ON CONFLICT (user_id, kind) DO UPDATE SET enabled = excluded.enabled`,
    viewer.id,
    kind,
    enabled ? 1 : 0
  )
  refresh()
  return { ok: true }
}

export async function deactivateAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  if (!(await checkPassword(viewer.id, String(formData.get("password") ?? "")))) return { error: "Your password is wrong." }
  transaction(() => {
    run("UPDATE users SET deactivated_at = ? WHERE id = ?", Date.now(), viewer.id)
    run("DELETE FROM sessions WHERE user_id = ?", viewer.id)
  })
  await destroySession()
  redirect("/login")
}

export async function deleteAccount(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  if (!(await checkPassword(viewer.id, String(formData.get("password") ?? "")))) return { error: "Your password is wrong." }
  if (String(formData.get("confirm") ?? "") !== viewer.handle) return { error: `Type @${viewer.handle} to confirm.` }

  const files = mediaFilesFor(treeOfAuthor(viewer.id))
  const profile = get<{ avatar_file: string | null; banner_file: string | null }>(
    "SELECT avatar_file, banner_file FROM users WHERE id = ?",
    viewer.id
  )
  run("DELETE FROM users WHERE id = ?", viewer.id)
  removeFiles(files)
  removeUpload(profile?.avatar_file ?? null)
  removeUpload(profile?.banner_file ?? null)
  await destroySession()
  redirect("/signup")
}
