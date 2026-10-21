// Unit checks for the Content Security Policy in lib/csp.ts. The policy limits where a page can send data and load things
// from, and it stops framing, base addresses and form targets. It sets no script-src (see the comment in lib/csp.ts).
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { contentSecurityPolicy } from "../lib/csp.ts"

function parse(policy) {
  const map = new Map()
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/)
    map.set(name, sources)
  }
  return map
}

test("no script or style directive is set, so the shell's own scripts keep working", () => {
  const policy = parse(contentSecurityPolicy({}))
  assert.equal(policy.has("script-src"), false)
  assert.equal(policy.has("default-src"), false)
  assert.equal(policy.has("style-src"), false)
})

test("the page cannot be framed, given another base address, or sent to another form target", () => {
  const policy = parse(contentSecurityPolicy({}))
  assert.deepEqual(policy.get("frame-ancestors"), ["'none'"])
  assert.deepEqual(policy.get("base-uri"), ["'self'"])
  assert.deepEqual(policy.get("form-action"), ["'self'"])
  assert.deepEqual(policy.get("object-src"), ["'none'"])
})

test("requests go to this server only, unless the object store or Turnstile is in use", () => {
  const plain = parse(contentSecurityPolicy({}))
  assert.deepEqual(plain.get("connect-src"), ["'self'"])
  const withStore = parse(contentSecurityPolicy({ RHENKO_R2_ENDPOINT: "https://account.r2.example.com/some/path" }))
  assert.deepEqual(withStore.get("connect-src"), ["'self'", "https://account.r2.example.com"])
  assert.ok(withStore.get("img-src").includes("https://account.r2.example.com"))
  assert.ok(withStore.get("media-src").includes("https://account.r2.example.com"))
  const withChallenge = parse(contentSecurityPolicy({ RHENKO_TURNSTILE_SITE_KEY: "site" }))
  assert.ok(withChallenge.get("connect-src").includes("https://challenges.cloudflare.com"))
  assert.deepEqual(withChallenge.get("frame-src"), ["https://challenges.cloudflare.com"])
})

test("an endpoint that is not a web address is ignored", () => {
  const policy = parse(contentSecurityPolicy({ RHENKO_R2_ENDPOINT: "not a url" }))
  assert.ok(!policy.get("img-src").some((s) => s.startsWith("http")))
  assert.deepEqual(policy.get("connect-src"), ["'self'"])
})

test("Turnstile is not named while its site key is unset", () => {
  const off = parse(contentSecurityPolicy({}))
  assert.deepEqual(off.get("frame-src"), ["'none'"])
  assert.ok(!off.get("connect-src").includes("https://challenges.cloudflare.com"))
})
