// Unit checks for lib/video-metadata.ts. A video is rewritten with ffmpeg before it is stored: its location, device, time,
// title, extra tracks and chapters are gone, the picture and sound are copied as they are, and the rotation stays. A file
// ffmpeg cannot read, or a server without ffmpeg, refuses the video. The videos are made here with ffmpeg and checked with
// ffprobe, so both have to be installed. Run with: npm run test:unit

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { VideoRefused, withCleanVideo } from "../lib/video-metadata.ts"

const haveTools = ["ffmpeg", "ffprobe"].every((tool) => spawnSync(tool, ["-version"], { stdio: "ignore" }).status === 0)
const skip = haveTools ? false : "ffmpeg and ffprobe are not installed"

const LOCATION = "+27.5916-099.7333/"
const MODEL = "iPhone 15 Pro"
const TIME = "2024-05-01T10:20:30Z"
const SUBTITLE = "Home at 12 Secret Street"
// Text that must not be anywhere in a cleaned file.
const SECRETS = ["27.5916", "099.7333", "iPhone", "Apple", "Secret", "2024-05-01", "Core Media", "Hunter"]
// Tags that carry nothing about the person: the container's own brand and the generic track names the muxer writes.
const HARMLESS_TAGS = new Set(["major_brand", "minor_version", "compatible_brands", "handler_name", "vendor_id", "language", "duration", "encoder"])

let dir
const sources = {}

function ff(...args) {
  execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] })
}

function probe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { encoding: "utf8" }))
}

function allTags(info) {
  return [info.format, ...info.streams].flatMap((part) => Object.entries(part?.tags ?? {}))
}

function rotationOf(info) {
  const video = info.streams.find((stream) => stream.codec_type === "video")
  const fromSideData = video?.side_data_list?.find((entry) => "rotation" in entry)?.rotation
  return fromSideData ?? Number(video?.tags?.rotate ?? 0)
}

function bytesOf(file) {
  return fs.readFileSync(file).toString("latin1")
}

function framesOf(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" })
  return Number(out.trim())
}

// The ffmpeg flags that put the details a phone records into a file.
function details(extra = []) {
  return [
    "-metadata", `location=${LOCATION}`,
    "-metadata", `location-eng=${LOCATION}`,
    "-metadata", `creation_time=${TIME}`,
    "-metadata", "title=Secret title",
    "-metadata", "comment=Hunter was here",
    "-metadata", "com.apple.quicktime.location.ISO6709=" + LOCATION,
    "-metadata", "com.apple.quicktime.make=Apple",
    "-metadata", `com.apple.quicktime.model=${MODEL}`,
    "-metadata:s:v:0", `creation_time=${TIME}`,
    "-metadata:s:v:0", "handler_name=Core Media Video",
    "-metadata:s:a:0", "handler_name=Core Media Audio",
    ...extra,
  ]
}

// An MP4 or MOV the way a phone makes it: picture, sound, a subtitle track with text, a cover picture, location and device
// tags, a creation time and a 90 degree rotation.
function makePhoneVideo(name, muxer) {
  const plain = path.join(dir, `plain-${name}`)
  const out = path.join(dir, name)
  fs.writeFileSync(path.join(dir, "words.srt"), `1\n00:00:00,000 --> 00:00:01,000\n${SUBTITLE}\n\n`)
  ff("-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-i", path.join(dir, "cover.jpg"), "-i", path.join(dir, "words.srt"),
    "-map", "0", "-map", "1", "-map", "2", "-map", "3",
    "-c:v:0", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-c:v:1", "copy", "-c:s", "mov_text", "-disposition:v:1", "attached_pic",
    "-f", muxer, plain)
  // The rotation is written into the track header. ffmpeg 6 takes -display_rotation; older ones take the rotate tag.
  try {
    ff("-display_rotation", "90", "-i", plain, "-map", "0", "-c", "copy", ...details(["-movflags", "use_metadata_tags"]), "-f", muxer, out)
  } catch {
    ff("-i", plain, "-map", "0", "-c", "copy", ...details(["-metadata:s:v:0", "rotate=90", "-movflags", "use_metadata_tags"]), "-f", muxer, out)
  }
  return out
}

before(() => {
  if (!haveTools) return
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rhenko-video-test-"))
  ff("-f", "lavfi", "-i", "testsrc=size=64x64:duration=1", "-frames:v", "1", "-metadata", "comment=Hunter GPS 27.5916", path.join(dir, "cover.jpg"))
  sources["video/mp4"] = makePhoneVideo("phone.mp4", "mp4")
  sources["video/quicktime"] = makePhoneVideo("phone.mov", "mov")
  ff("-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
    "-c:v", "libvpx-vp9", "-c:a", "libopus", ...details(), "-f", "webm", path.join(dir, "recorded.webm"))
  sources["video/webm"] = path.join(dir, "recorded.webm")
})

after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

function workFolders() {
  return fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("rhenko-video-") && !entry.startsWith("rhenko-video-test-"))
}

// Runs the step on a source file and returns the cleaned file, written next to it.
async function clean(mime) {
  const source = sources[mime]
  const out = path.join(dir, `clean-${path.basename(source)}`)
  const result = await withCleanVideo(await fs.openAsBlob(source, { type: mime }), mime, async (blob) => {
    fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()))
    assert.equal(blob.type, mime)
    return "stored"
  })
  assert.equal(result, "stored", "what the callback returns comes back")
  return out
}

for (const mime of ["video/mp4", "video/quicktime", "video/webm"]) {
  test(`${mime}: the test video really carries the details`, { skip }, () => {
    const source = sources[mime]
    const raw = bytesOf(source)
    assert.ok(raw.includes("27.5916"), "location is in the file")
    assert.ok(raw.includes("Secret title"), "title is in the file")
    if (mime !== "video/webm") {
      assert.ok(raw.includes(MODEL), "device model is in the file")
      assert.ok(raw.includes("ISO6709"), "the QuickTime location key is in the file")
      assert.ok(raw.includes(SUBTITLE), "the subtitle text is in the file")
      assert.equal(rotationOf(probe(source)), 90)
      assert.ok(probe(source).streams.some((stream) => stream.codec_type === "subtitle"))
    }
  })

  test(`${mime}: location, device, time and extra tracks are gone, the rotation stays and the video still plays`, { skip }, async () => {
    const before = workFolders()
    const out = await clean(mime)
    const info = probe(out)

    const raw = bytesOf(out)
    for (const secret of SECRETS) assert.ok(!raw.includes(secret), `${secret} is not in the cleaned file`)
    assert.ok(!raw.includes("ISO6709"))

    const tags = allTags(info)
    assert.ok(tags.every(([key]) => HARMLESS_TAGS.has(key.toLowerCase())), `only harmless tags are left: ${JSON.stringify(tags)}`)
    assert.ok(!tags.some(([key]) => /creation_time|location|title|comment|com\.apple/i.test(key)))

    assert.deepEqual(info.streams.map((stream) => stream.codec_type).sort(), ["audio", "video"], "picture and sound only")
    assert.ok(info.streams.every((stream) => stream.disposition?.attached_pic !== 1))
    if (mime !== "video/webm") assert.equal(rotationOf(info), 90, "the picture still displays the right way up")

    // The picture and sound are copied, not re-encoded.
    const original = probe(sources[mime])
    for (const type of ["video", "audio"]) {
      const was = original.streams.find((stream) => stream.codec_type === type)
      const now = info.streams.find((stream) => stream.codec_type === type)
      assert.equal(now.codec_name, was.codec_name)
      assert.equal(now.width, was.width)
      assert.equal(now.height, was.height)
    }
    assert.equal(framesOf(out), framesOf(sources[mime]))
    // Every frame decodes without a complaint.
    const decode = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-i", out, "-f", "null", "-"], { encoding: "utf8" })
    assert.equal(decode.status, 0)
    assert.equal(decode.stderr.trim(), "")

    assert.deepEqual(workFolders(), before, "the working folder is deleted")
  })
}

test("a file ffmpeg cannot read is refused, and nothing is passed on or left on disk", { skip }, async (t) => {
  t.mock.method(console, "error", () => undefined)
  const before = workFolders()
  const samples = {
    "text with an mp4 label": Buffer.from("this is not a video at all"),
    "a playlist that points at a local file": Buffer.from("#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:1,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n"),
    "a box header and nothing else": Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(12)]),
    "a WebM sent as an MP4": fs.readFileSync(sources["video/webm"]),
  }
  for (const [what, bytes] of Object.entries(samples)) {
    let called = false
    await assert.rejects(
      withCleanVideo(new Blob([bytes]), "video/mp4", async () => {
        called = true
      }),
      (error) => error instanceof VideoRefused && /couldn't be read/.test(error.message),
      what
    )
    assert.equal(called, false, `${what}: the original is never handed on`)
  }
  assert.deepEqual(workFolders(), before)
})

test("a type that is not a video is refused", { skip }, async () => {
  await assert.rejects(withCleanVideo(new Blob(["x"]), "video/x-matroska", async () => "no"), VideoRefused)
  await assert.rejects(withCleanVideo(new Blob(["x"]), "image/png", async () => "no"), VideoRefused)
})

test("a server without ffmpeg refuses the video", { skip }, async (t) => {
  t.mock.method(console, "error", () => undefined)
  const path_ = process.env.PATH
  process.env.PATH = path.join(dir, "no-such-folder")
  try {
    let called = false
    await assert.rejects(
      withCleanVideo(await fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" }), "video/mp4", async () => {
        called = true
      }),
      (error) => error instanceof VideoRefused && /can't be uploaded right now/.test(error.message)
    )
    assert.equal(called, false)
  } finally {
    process.env.PATH = path_
  }
})

test("an error from the callback goes on unchanged, and the working folder is still deleted", { skip }, async () => {
  const before = workFolders()
  const failure = new Error("storage is down")
  await assert.rejects(
    withCleanVideo(await fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" }), "video/mp4", async () => {
      assert.equal(workFolders().length, before.length + 1, "the folder exists while the callback runs")
      throw failure
    }),
    (error) => error === failure
  )
  assert.deepEqual(workFolders(), before)
})
