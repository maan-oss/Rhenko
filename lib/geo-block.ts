// Rhenko is not offered in the countries below. The country comes from Cloudflare's CF-IPCountry header, which exists only
// when the domain runs through Cloudflare's proxy. The list lives in code, not in an environment variable, so a missing
// setting cannot open the service in a blocked country.
export const BLOCKED_COUNTRIES: ReadonlySet<string> = new Set(["AU"])

// Pages anyone may read, wherever they are, so the reason for the block and the rules stay visible.
const OPEN_PAGES = new Set(["/unavailable", "/terms", "/privacy", "/rules", "/safety", "/transparency", "/legal", "/copyright"])
const OPEN_PREFIXES = ["/terms/", "/privacy/", "/rules/", "/safety/", "/transparency/", "/legal/", "/copyright/"]

export function isOpenToBlocked(pathname: string): boolean {
  if (OPEN_PAGES.has(pathname)) return true
  return OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// The header is trusted only behind a proxy (RHENKO_TRUST_PROXY=1). A server that anyone can reach directly would accept a
// country the visitor typed in, so without that setting the country is unknown and nothing is blocked. The hosting steps
// in docs/legal-operations.md require both.
export function countryOf(headers: Headers, env: Record<string, string | undefined> = process.env): string | null {
  if (env.RHENKO_TRUST_PROXY !== "1") return null
  const code = (headers.get("cf-ipcountry") ?? "").trim().toUpperCase()
  // XX means Cloudflare could not tell where the visitor is. T1 means Tor. Neither names a country.
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null
  return code
}

export function isBlockedCountry(code: string | null): boolean {
  return code !== null && BLOCKED_COUNTRIES.has(code)
}
