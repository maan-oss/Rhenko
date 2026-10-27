// Group invite links. A group can have one link at a time, /join/<token>, and anyone with it can join the group without
// approval. Resetting the link makes a new token, so the old link stops working. Pure functions only, so the proxy, client
// components and the unit tests can use them. The token itself is made on the server (lib/group-invites.ts).

// 16 random bytes in base64url: 22 letters, digits, "-" or "_".
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/
const JOIN_PATH_PATTERN = /^\/join\/([A-Za-z0-9_-]{22})$/

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value)
}

// The page a link opens, under the app's own address.
export function joinPath(token: string): string {
  return `/join/${token}`
}

// Where sign-in sends someone back to afterwards. Only an invite page is taken, so a crafted link can't send a person off
// the site or anywhere else in it.
export function returnPathFrom(value: unknown): string | null {
  if (typeof value !== "string") return null
  const match = JOIN_PATH_PATTERN.exec(value)
  return match ? joinPath(match[1]) : null
}

// A sign-in page with the place to come back to, when there is one: the next step of sign-in, such as the two-factor code,
// carries it on.
export function withReturnPath(path: string, back: string | null): string {
  return back ? `${path}?next=${encodeURIComponent(back)}` : path
}

// The sign-in page for someone who is signed out. Opening an invite link brings them back to the invite afterwards.
export function loginPathFor(pathname: string): string {
  return withReturnPath("/login", returnPathFrom(pathname))
}
