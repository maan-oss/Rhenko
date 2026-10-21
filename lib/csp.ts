// The Content Security Policy sent with every page. It limits where a page can send data and load things from, and it
// stops the page from being framed, given another base address, or sent to another form target.
//
// What it does not do: it sets no script-src, so an inline script can still run. A script-blocking policy needs a nonce
// on each script, and the pages are prerendered (cacheComponents), so the shell Next.js builds carries no nonce. Blocking
// scripts means either turning cacheComponents off, which loses partial prefetching, or hashing the shell's scripts. That
// trade-off is a decision for the operator, and it is not made here.

const CLOUDFLARE_CHALLENGE = "https://challenges.cloudflare.com"

// Origin of the object store that serves media (its presigned links point there), or null when media is kept on this server.
function storageOrigin(endpoint: string | undefined): string | null {
  const value = endpoint?.trim()
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function contentSecurityPolicy(env: Record<string, string | undefined> = process.env): string {
  const storage = storageOrigin(env.RHENKO_R2_ENDPOINT)
  // Turnstile is loaded only when its site key is set, so the policy names it only then.
  const challenge = env.RHENKO_TURNSTILE_SITE_KEY?.trim() ? CLOUDFLARE_CHALLENGE : null
  const media = ["'self'", "blob:", ...(storage ? [storage] : [])]

  const directives: [string, string[]][] = [
    // Media and pictures: this server, previews made in the browser, and the object store when it is configured.
    ["img-src", [...media, "data:"]],
    ["media-src", media],
    ["font-src", ["'self'"]],
    // Requests the page makes. A script that was injected into the page cannot send data anywhere else.
    ["connect-src", ["'self'", ...(storage ? [storage] : []), ...(challenge ? [challenge] : [])]],
    ["frame-src", challenge ? [challenge] : ["'none'"]],
    ["worker-src", ["'self'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ]
  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ")
}
