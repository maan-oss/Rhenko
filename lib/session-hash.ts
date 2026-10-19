import { createHash } from "node:crypto"

// The stored form of a session token. The database keeps only this hash, so a read of the sessions table never gives anyone
// a working cookie. It lives apart from lib/auth.ts so the proxy can use it without loading the whole auth module.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}
