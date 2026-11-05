// Rules for linking a device to an account: which public keys a device may register, how many devices one account may
// have, and how a device is labelled. No database here, so the unit tests in tests/e2ee-rules.test.mjs can run them.

export const MAX_DEVICES_PER_USER = 10
export const DEVICE_LABEL_MAX = 64
const DEFAULT_LABEL = "This device"

// A P-256 public key in SPKI form is 91 bytes, which is 124 characters of base64. The limit leaves room and nothing more.
const PUBLIC_KEY_MAX_CHARS = 256
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export type DeviceRegistrationInput = { agreement: unknown; signing: unknown; label: unknown }
export type DeviceRegistration = { agreement: string; signing: string; label: string }
export type DeviceRegistrationCheck = { ok: true; value: DeviceRegistration } | { ok: false; error: string }

// The label a device shows in the device list: plain text, no control characters, at most DEVICE_LABEL_MAX characters.
export function deviceLabel(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_LABEL
  const spaced = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s{2,}/g, " ").trim()
  const cleaned = Array.from(spaced).slice(0, DEVICE_LABEL_MAX).join("").trim()
  return cleaned || DEFAULT_LABEL
}

// True when the value is a base64 SPKI P-256 public key that imports for the given use: ECDH for the agreement key,
// ECDSA for the signing key. Anything else, including keys on another curve, is refused.
export async function isPublicKey(value: unknown, use: "agreement" | "signing"): Promise<boolean> {
  if (typeof value !== "string" || value.length === 0 || value.length > PUBLIC_KEY_MAX_CHARS) return false
  if (!BASE64.test(value)) return false
  const algorithm = use === "agreement" ? { name: "ECDH", namedCurve: "P-256" } : { name: "ECDSA", namedCurve: "P-256" }
  try {
    const key = await globalThis.crypto.subtle.importKey(
      "spki",
      Uint8Array.from(Buffer.from(value, "base64")),
      algorithm,
      true,
      use === "agreement" ? [] : ["verify"]
    )
    return key.type === "public"
  } catch {
    return false
  }
}

// Checks what a device sends when it is linked. The two keys must be different, so one key cannot stand in for both.
export async function checkDeviceRegistration(input: DeviceRegistrationInput): Promise<DeviceRegistrationCheck> {
  if (!(await isPublicKey(input.agreement, "agreement"))) {
    return { ok: false, error: "This device sent an encryption key that is not valid." }
  }
  if (!(await isPublicKey(input.signing, "signing"))) {
    return { ok: false, error: "This device sent a signing key that is not valid." }
  }
  if (input.agreement === input.signing) {
    return { ok: false, error: "This device sent the same key twice." }
  }
  return {
    ok: true,
    value: { agreement: input.agreement as string, signing: input.signing as string, label: deviceLabel(input.label) },
  }
}
