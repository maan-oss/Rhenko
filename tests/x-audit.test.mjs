// Unit checks for the fixes from the X complaints audit (docs/x-research-mapping.md).
//   Videos: a cleaned MP4 or MOV has its index (moov) before its picture and sound (mdat), so a phone can start and seek
//   without fetching the end of the file first (lib/video-metadata.ts). Needs ffmpeg; skipped without it.
//   Page policy: with Supabase storage, the media route redirects to the project address, so img-src and media-src name it
//   (lib/csp.ts).
// Run with: npm run test:unit

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { withCleanVideo } from "../lib/video-metadata.ts"
import { contentSecurityPolicy } from "../lib/csp.ts"

// ── Videos start fast on phones ─────────────────────────────────────────────────────────────────────────────────────

const haveFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
const noFfmpeg = haveFfmpeg ? false : "ffmpeg is not installed"
let dir

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rhenko-x-audit-"))
})

after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

// A short video the way ffmpeg writes it by default: its moov box at the end.
function makeVideo(name, codecArgs) {
  const out = path.join(dir, name)
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", ...codecArgs, "-shortest", out],
    { stdio: ["ignore", "ignore", "pipe"] }
  )
  return out
}

// The top-level boxes of an MP4 or MOV file, in order.
function topBoxes(buf) {
  const boxes = []
  let at = 0
  while (at + 8 <= buf.length) {
    let size = buf.readUInt32BE(at)
    const type = buf.subarray(at + 4, at + 8).toString("latin1")
    if (size === 1) size = Number(buf.readBigUInt64BE(at + 8))
    else if (size === 0) size = buf.length - at
    if (size < 8) break
    boxes.push(type)
    at += size
  }
  return boxes
}

async function cleaned(file, mime) {
  return await withCleanVideo(await fs.openAsBlob(file, { type: mime }), mime, async (clean) => Buffer.from(await clean.arrayBuffer()))
}

for (const [name, mime] of [
  ["phone.mp4", "video/mp4"],
  ["phone.mov", "video/quicktime"],
]) {
  test(`a cleaned ${mime} video has its index before its picture and sound`, { skip: noFfmpeg }, async () => {
    const source = makeVideo(name, ["-c:v", "mpeg4", "-c:a", "aac"])
    const original = topBoxes(fs.readFileSync(source))
    assert.ok(original.indexOf("mdat") < original.indexOf("moov"), `the test video should start with its index at the end: ${original.join(", ")}`)
    const boxes = topBoxes(await cleaned(source, mime))
    assert.ok(boxes.includes("moov") && boxes.includes("mdat"), `the cleaned video is missing a box: ${boxes.join(", ")}`)
    assert.ok(boxes.indexOf("moov") < boxes.indexOf("mdat"), `the index is still after the picture and sound: ${boxes.join(", ")}`)
  })
}

test("a WebM video is still cleaned (the MP4 index option is not passed to it)", { skip: noFfmpeg }, async () => {
  const source = makeVideo("clip.webm", ["-c:v", "libvpx", "-c:a", "libopus"])
  const out = await cleaned(source, "video/webm")
  assert.ok(out.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), "the cleaned file is not a WebM")
})

// ── Media from Supabase storage is allowed by the page policy ───────────────────────────────────────────────────────

function policyOf(env) {
  const map = new Map()
  for (const part of contentSecurityPolicy(env).split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/)
    map.set(name, sources)
  }
  return map
}

test("with Supabase storage (the default store), photos and videos may load from the project's address", () => {
  for (const env of [{ SUPABASE_URL: "https://project.supabase.co/" }, { RHENKO_STORAGE: "supabase", SUPABASE_URL: "https://project.supabase.co" }]) {
    const policy = policyOf(env)
    assert.ok(policy.get("img-src").includes("https://project.supabase.co"), "img-src leaves out the Supabase project")
    assert.ok(policy.get("media-src").includes("https://project.supabase.co"), "media-src leaves out the Supabase project")
  }
})

test("Supabase is not named when media is kept on this server or in R2", () => {
  const local = policyOf({ RHENKO_STORAGE: "local", SUPABASE_URL: "https://project.supabase.co" })
  assert.deepEqual(local.get("media-src"), ["'self'", "blob:"])
  const r2 = policyOf({ RHENKO_STORAGE: "r2", RHENKO_R2_ENDPOINT: "https://account.r2.example.com", SUPABASE_URL: "https://project.supabase.co" })
  assert.deepEqual(r2.get("media-src"), ["'self'", "blob:", "https://account.r2.example.com"])
})

test("a Supabase address that is not a web address is ignored, and no origin is named twice", () => {
  assert.deepEqual(policyOf({ SUPABASE_URL: "not a url" }).get("media-src"), ["'self'", "blob:"])
  const same = policyOf({ SUPABASE_URL: "https://store.example.com", RHENKO_R2_ENDPOINT: "https://store.example.com/bucket" })
  assert.deepEqual(same.get("media-src"), ["'self'", "blob:", "https://store.example.com"])
})
