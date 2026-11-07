// Unit checks for the photo and video scan switch, in lib/image-scan.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { SCAN_REFUSED, SEALED_REFUSED, scanMedia, scanMode, scanSealed } from "../lib/image-scan.ts"

// Sets environment variables for one call, then puts them back as they were.
async function withEnv(values, fn) {
  const saved = {}
  for (const key of Object.keys(values)) {
    saved[key] = process.env[key]
    if (values[key] === undefined) delete process.env[key]
    else process.env[key] = values[key]
  }
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

const photo = () => new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" })

test("with no scanner set, every photo and video is refused", async () => {
  await withEnv({ RHENKO_IMAGE_SCAN: undefined, NODE_ENV: "development" }, async () => {
    assert.equal(scanMode(), "none")
    const result = await scanMedia(photo())
    assert.deepEqual(result, { ok: false, match: false, error: SCAN_REFUSED })
  })
})

test("the test scanner accepts media outside production, and is refused in production", async () => {
  await withEnv({ RHENKO_IMAGE_SCAN: "test", NODE_ENV: "development" }, async () => {
    assert.equal(scanMode(), "test")
    assert.deepEqual(await scanMedia(photo()), { ok: true })
  })
  await withEnv({ RHENKO_IMAGE_SCAN: "test", NODE_ENV: "production" }, async () => {
    assert.equal(scanMode(), "unknown")
    assert.equal((await scanMedia(photo())).ok, false)
  })
})

test("a misspelt or unknown scanner setting refuses media rather than switching scanning off", async () => {
  await withEnv({ RHENKO_IMAGE_SCAN: "tset", NODE_ENV: "development" }, async () => {
    assert.equal(scanMode(), "unknown")
    assert.equal((await scanMedia(photo())).ok, false)
  })
})

test("sealed files from encrypted chats are refused unless the test scanner is on", async () => {
  await withEnv({ RHENKO_IMAGE_SCAN: undefined, NODE_ENV: "development" }, async () => {
    assert.deepEqual(await scanSealed(), { ok: false, match: false, error: SEALED_REFUSED })
  })
  await withEnv({ RHENKO_IMAGE_SCAN: "test", NODE_ENV: "development" }, async () => {
    assert.deepEqual(await scanSealed(), { ok: true })
  })
})
