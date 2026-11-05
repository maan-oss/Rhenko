// Unit checks for the rules a device must meet to be linked (lib/e2ee-rules.ts): its keys must be P-256 public keys of the
// right kind, the two keys must differ, and the label is cleaned up. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { DEVICE_LABEL_MAX, checkDeviceRegistration, deviceLabel, isPublicKey } from "../lib/e2ee-rules.ts"

async function publicKeyBase64(algorithm, namedCurve) {
  const pair = await globalThis.crypto.subtle.generateKey(
    { name: algorithm, namedCurve },
    true,
    algorithm === "ECDH" ? ["deriveKey"] : ["sign", "verify"]
  )
  return Buffer.from(await globalThis.crypto.subtle.exportKey("spki", pair.publicKey)).toString("base64")
}

test("a P-256 agreement key and a P-256 signing key are accepted", async () => {
  const agreement = await publicKeyBase64("ECDH", "P-256")
  const signing = await publicKeyBase64("ECDSA", "P-256")
  assert.equal(await isPublicKey(agreement, "agreement"), true)
  assert.equal(await isPublicKey(signing, "signing"), true)
})

test("a key on another curve is refused", async () => {
  const p384 = await publicKeyBase64("ECDH", "P-384")
  assert.equal(await isPublicKey(p384, "agreement"), false)
})

test("values that are not base64 SPKI keys are refused", async () => {
  assert.equal(await isPublicKey(undefined, "agreement"), false)
  assert.equal(await isPublicKey(42, "signing"), false)
  assert.equal(await isPublicKey("", "signing"), false)
  assert.equal(await isPublicKey("not a key!", "signing"), false)
  assert.equal(await isPublicKey("AAAA", "agreement"), false)
  assert.equal(await isPublicKey("A".repeat(400), "agreement"), false)
})

test("the device label is plain text, trimmed, capped, and never empty", () => {
  assert.equal(deviceLabel(undefined), "This device")
  assert.equal(deviceLabel("   "), "This device")
  assert.equal(deviceLabel("Laptop\u0000\u0007 office"), "Laptop office")
  assert.equal(deviceLabel("  Maya's phone  "), "Maya's phone")
  const long = "🙂".repeat(DEVICE_LABEL_MAX + 10)
  assert.equal(Array.from(deviceLabel(long)).length, DEVICE_LABEL_MAX)
})

test("a registration with good keys is accepted and its label cleaned", async () => {
  const result = await checkDeviceRegistration({
    agreement: await publicKeyBase64("ECDH", "P-256"),
    signing: await publicKeyBase64("ECDSA", "P-256"),
    label: "  Phone\n",
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.label, "Phone")
})

test("a registration with a bad signing key or the same key twice is refused", async () => {
  const agreement = await publicKeyBase64("ECDH", "P-256")
  const bad = await checkDeviceRegistration({ agreement, signing: await publicKeyBase64("ECDH", "P-384"), label: "x" })
  assert.equal(bad.ok, false)
  const twice = await checkDeviceRegistration({ agreement, signing: agreement, label: "x" })
  assert.equal(twice.ok, false)
  const missing = await checkDeviceRegistration({ agreement: undefined, signing: undefined, label: undefined })
  assert.equal(missing.ok, false)
})
