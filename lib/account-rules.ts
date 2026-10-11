// Rules for account settings, sign-up and password reset. Pure functions only, so client components can import them.
import { MAX_PASSWORD, MIN_PASSWORD, countChars } from "@/lib/rules"

export const MAX_STATUS = 40
export const MAX_EMAIL = 254
export const EMAIL_CODE_MINUTES = 15
export const PASSWORD_RULE = `At least ${MIN_PASSWORD} characters.`

// Whether a sensitive change asks for a two-factor code, and which codes can work: none while two-factor sign-in is
// off, an app code or a recovery code while it is on, and only a recovery code when the server can't read the
// authenticator key.
export type CodeNeed = "none" | "app" | "recovery"

// A status is one line: control characters and runs of spaces become single spaces.
export function cleanStatus(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
}

export function statusProblem(status: string): string | null {
  const length = countChars(status)
  if (length > MAX_STATUS) return `A status can have up to ${MAX_STATUS} characters. This one has ${length}.`
  return null
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Passwords need at least ${MIN_PASSWORD} characters.`
  if (password.length > MAX_PASSWORD) return `Passwords can have up to ${MAX_PASSWORD} characters.`
  return null
}

export function cleanEmail(value: string): string {
  return value.trim()
}

// A practical check rather than the full standard: something before one @, a dotted domain after it, and no spaces
// or control characters.
export function emailProblem(email: string): string | null {
  if (email.length === 0) return "Enter an email address."
  if (email.length > MAX_EMAIL) return `Email addresses can have up to ${MAX_EMAIL} characters.`
  if (/[\u0000-\u001f\u007f]/.test(email) || !/^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]+$/.test(email)) {
    return "Enter a full email address, like name@example.com."
  }
  return null
}

export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}
