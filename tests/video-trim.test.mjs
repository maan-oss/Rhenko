// Unit checks for trimming a video before it is posted. The rules first (lib/trim-rules.ts): what the server accepts as a trim,
// how the handles move, how the times read. Then the cut itself (lib/video-metadata.ts): a 10 second MP4 made here with ffmpeg
// is cut from 2 to 5 seconds and measured with ffprobe, and windows that don't fit the video are refused. ffmpeg and ffprobe
// have to be installed. Run with: npm run test:unit

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  MIN_TRIM_SECONDS,
  coversWhole,
  firstWindow,
  formatClock,
  moveEnd,
  moveStart,
  parseTrimFields,
  rangeLabel,
  spokenLength,
  trimField,
  trimProblem,
} from "../lib/trim-rules.ts"
import { VideoRefused, withCleanVideo } from "../lib/video-metadata.ts"

const MAX = 140

// ── The rules ───────────────────────────────────────────────────────────────────────────────────────────────────────

test("a trim must be two finite numbers with 0 <= start < end, at least a second and at most 140 seconds", () => {
  assert.equal(trimProblem({ start: 2, end: 5 }, MAX, null), null)
  assert.equal(trimProblem({ start: 0, end: 140 }, MAX, null), null, "exactly 140 seconds is allowed")
  assert.equal(trimProblem({ start: 3.1, end: 143.1 }, MAX, null), null, "decimal arithmetic doesn't tip 140 over")
  assert.equal(trimProblem({ start: 0, end: 1 }, MAX, null), null, "exactly the shortest part")

  const refused = [
    [{ start: 5, end: 5 }, "start equal to end"],
    [{ start: 5, end: 2 }, "start after end"],
    [{ start: -1, end: 4 }, "negative start"],
    [{ start: Number.NaN, end: 4 }, "NaN start"],
    [{ start: 1, end: Number.NaN }, "NaN end"],
    [{ start: 0, end: Number.POSITIVE_INFINITY }, "infinite end"],
    [{ start: Number.NEGATIVE_INFINITY, end: 4 }, "infinite start"],
    [{ start: "2", end: 5 }, "start as a string"],
    [{ start: 2, end: null }, "missing end"],
    [{ start: undefined, end: undefined }, "nothing"],
    [{ start: 0, end: 0.5 }, "under a second"],
    [{ start: 0, end: 140.5 }, "a half second too long"],
    [{ start: 0, end: 141 }, "too long"],
    [{ start: 10, end: 900 }, "far too long"],
  ]
  for (const [trim, what] of refused) assert.equal(typeof trimProblem(trim, MAX, null), "string", what)
})

test("a trim is checked against the length of the real video", () => {
  assert.equal(trimProblem({ start: 2, end: 5 }, MAX, 10), null)
  assert.equal(trimProblem({ start: 0, end: 10 }, MAX, 10), null, "the whole video")
  assert.equal(trimProblem({ start: 9, end: 10.3 }, MAX, 10), null, "the browser and ffprobe may disagree by a frame or two")
  assert.match(trimProblem({ start: 8, end: 12 }, MAX, 10), /ends after the video/)
  assert.match(trimProblem({ start: 11, end: 12 }, MAX, 10), /starts after the video/)
  assert.match(trimProblem({ start: 10, end: 11 }, MAX, 10), /starts after the video/, "starting at the very end leaves nothing")
  assert.match(trimProblem({ start: 9.6, end: 10.4 }, MAX, 10), /at least 1 second/, "the part inside the video is under a second")
  assert.match(trimProblem({ start: 0, end: 141 }, MAX, 600), /up to 140 seconds/)
})

test("the form fields are plain numbers, or both empty for no trim", () => {
  assert.deepEqual(parseTrimFields(undefined, undefined, MAX), { ok: true, trim: null })
  assert.deepEqual(parseTrimFields("", "", MAX), { ok: true, trim: null })
  assert.deepEqual(parseTrimFields("2", "5", MAX), { ok: true, trim: { start: 2, end: 5 } })
  assert.deepEqual(parseTrimFields("0", "4.5", MAX), { ok: true, trim: { start: 0, end: 4.5 } })
  assert.deepEqual(parseTrimFields("3.123", "9.999", MAX), { ok: true, trim: { start: 3.123, end: 9.999 } })

  const bad = [
    ["2", ""],
    ["", "5"],
    ["NaN", "5"],
    ["2", "NaN"],
    ["Infinity", "5"],
    ["-1", "5"],
    ["1e3", "1e4"],
    [" 2", "5"],
    ["2,5", "9"],
    ["0x10", "20"],
    ["2", "5 "],
    ["5", "2"],
    ["5", "5"],
    ["0", "141"],
    ["0", "99999999"],
    [2, 5],
    [null, "5"],
    [new Blob(["2"]), "5"],
  ]
  for (const [start, end] of bad) {
    const result = parseTrimFields(start, end, MAX)
    assert.equal(result.ok, false, `${String(start)} to ${String(end)}`)
    assert.equal(typeof result.error, "string")
  }
})

test("a trim goes into the form as plain milliseconds", () => {
  assert.equal(trimField(3.1), "3.1")
  assert.equal(trimField(143.10000000000002), "143.1")
  assert.equal(trimField(10.01666666), "10.017")
  assert.equal(trimField(0), "0")
  assert.equal(parseTrimFields(trimField(3.1), trimField(3.1 + 140), MAX).ok, true)
})

test("the handles can't cross, keep at least a second apart, and stay inside 0 and the length", () => {
  const duration = 30
  let window = { start: 4, end: 20 }
  assert.deepEqual(moveStart(window, 10, MAX), { start: 10, end: 20 })
  assert.deepEqual(moveStart(window, 19.5, MAX), { start: 19, end: 20 }, "stops a second before the end handle")
  assert.deepEqual(moveStart(window, 25, MAX), { start: 19, end: 20 }, "can't pass the end handle")
  assert.deepEqual(moveStart(window, -5, MAX), { start: 0, end: 20 }, "can't go before the video")
  assert.deepEqual(moveEnd(window, 4.2, duration, MAX), { start: 4, end: 5 }, "stops a second after the start handle")
  assert.deepEqual(moveEnd(window, 1, duration, MAX), { start: 4, end: 5 }, "can't pass the start handle")
  assert.deepEqual(moveEnd(window, 99, duration, MAX), { start: 4, end: 30 }, "can't go past the video")
  assert.deepEqual(moveEnd(window, 29.97, duration, MAX), { start: 4, end: 30 }, "all the way right is the exact end")
  assert.deepEqual(moveStart(window, 7.26, MAX), { start: 7.3, end: 20 }, "handles move in tenths")

  // A length that is not a whole number of tenths still ends exactly where the video does.
  window = { start: 0, end: 10.016 }
  assert.equal(moveEnd(window, 10.1, 10.016, MAX).end, 10.016)
  assert.deepEqual(moveStart(window, 9.99, MAX), { start: 9, end: 10.016 }, "a second before an end that is not on a tenth")

  // No sequence of moves breaks the rules.
  let state = { start: 0, end: 12 }
  const sizes = [-3, 0.1, 7.7, 11.95, 12, 40, 2.5, 99, -1, 0.04]
  for (const want of sizes) {
    for (const move of [(w) => moveStart(w, want, MAX), (w) => moveEnd(w, want, 12, MAX)]) {
      state = move(state)
      assert.ok(state.start >= 0 && state.end <= 12 + 1e-9)
      assert.ok(state.end - state.start >= MIN_TRIM_SECONDS - 1e-9, `${JSON.stringify(state)} is at least a second`)
      assert.equal(trimProblem(state, MAX, 12), null, `${JSON.stringify(state)} is acceptable to the server`)
    }
  }
})

test("a long video starts as its first 140 seconds, and the part can never grow past 140", () => {
  const duration = 272
  let window = firstWindow(duration, MAX)
  assert.deepEqual(window, { start: 0, end: 140 })
  assert.deepEqual(firstWindow(30, MAX), { start: 0, end: 30 }, "a short video starts as all of it")
  window = moveEnd(window, 200, duration, MAX)
  assert.deepEqual(window, { start: 0, end: 140 }, "the end handle stops at 140 seconds")
  window = moveStart(window, 60, MAX)
  assert.deepEqual(window, { start: 60, end: 140 })
  window = moveEnd(window, 272, duration, MAX)
  assert.deepEqual(window, { start: 60, end: 200 }, "the end handle stops 140 seconds after the start")
  window = moveStart(window, 0, MAX)
  assert.deepEqual(window, { start: 60, end: 200 }, "the start handle can't go back and stretch the part")
  assert.equal(trimProblem(window, MAX, duration), null)
  window = moveStart(moveEnd(window, 270.3, duration, MAX), 130.3, MAX)
  assert.equal(trimProblem(window, MAX, duration), null)
  assert.ok(window.end - window.start <= MAX + 1e-9)
})

test("the whole video needs no cut", () => {
  assert.equal(coversWhole({ start: 0, end: 30 }, 30), true)
  assert.equal(coversWhole({ start: 0.1, end: 30 }, 30), false)
  assert.equal(coversWhole({ start: 0, end: 29.9 }, 30), false)
})

test("times read as 0:04, and the range as 0:04 to 0:31", () => {
  assert.equal(formatClock(0), "0:00")
  assert.equal(formatClock(4), "0:04")
  assert.equal(formatClock(31), "0:31")
  assert.equal(formatClock(65), "1:05")
  assert.equal(formatClock(140), "2:20")
  assert.equal(formatClock(3723), "1:02:03")
  assert.equal(formatClock(4.5), "0:04.5", "a cut between whole seconds says so")
  assert.equal(formatClock(59.96), "1:00")
  assert.equal(formatClock(-3), "0:00")
  assert.equal(rangeLabel({ start: 4, end: 31 }), "0:04 to 0:31")
  assert.equal(rangeLabel({ start: 4.5, end: 31 }), "0:04.5 to 0:31")
  assert.equal(spokenLength(27), "27 seconds")
  assert.equal(spokenLength(1), "1 second")
  assert.equal(spokenLength(60), "1 minute")
  assert.equal(spokenLength(125), "2 minutes 5 seconds")
})

// ── The cut ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const haveTools = ["ffmpeg", "ffprobe"].every((tool) => spawnSync(tool, ["-version"], { stdio: "ignore" }).status === 0)
const skip = haveTools ? false : "ffmpeg and ffprobe are not installed"

const LOCATION = "+27.5916-099.7333/"
const SECRETS = ["27.5916", "099.7333", "iPhone", "Apple", "Secret", "2024-05-01", "Core Media", "Hunter"]
const HARMLESS_TAGS = new Set(["major_brand", "minor_version", "compatible_brands", "handler_name", "vendor_id", "language", "duration", "encoder"])

let dir
const sources = {}

function ff(...args) {
  execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] })
}

function probe(file) {
  return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-show_chapters", "-of", "json", file], { encoding: "utf8" }))
}

function framesOf(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file], { encoding: "utf8" })
  return Number(out.trim())
}

function bytesOf(file) {
  return fs.readFileSync(file).toString("latin1")
}

// One grey 64 by 48 picture from a video, at a time, as bytes.
function pictureAt(file, seconds) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-nostdin", "-ss", String(seconds), "-i", file, "-frames:v", "1", "-vf", "scale=64:48,format=gray", "-f", "rawvideo", "-"],
    { maxBuffer: 1 << 20 }
  )
}

function difference(a, b) {
  assert.equal(a.length, b.length)
  let total = 0
  for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i])
  return total / a.length
}

const TAGS = [
  "-metadata", `location=${LOCATION}`,
  "-metadata", "creation_time=2024-05-01T10:20:30Z",
  "-metadata", "title=Secret title",
  "-metadata", "comment=Hunter was here",
  "-metadata", "com.apple.quicktime.make=Apple",
  "-metadata", "com.apple.quicktime.model=iPhone 15 Pro",
  "-metadata:s:v:0", "handler_name=Core Media Video",
  "-metadata:s:a:0", "handler_name=Core Media Audio",
]

before(() => {
  if (!haveTools) return
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rhenko-video-test-"))
  // 10 seconds at 25 frames a second, with a picture that changes every frame and a tone.
  const tenSeconds = ["-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=10", "-f", "lavfi", "-i", "sine=frequency=440:duration=10"]
  // The MP4 also has a chapter named after a place.
  fs.writeFileSync(path.join(dir, "chapters.txt"), ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=10000\ntitle=Hunter\n")
  ff(...tenSeconds, "-i", path.join(dir, "chapters.txt"), "-map", "0", "-map", "1", "-map_chapters", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", ...TAGS, "-movflags", "use_metadata_tags", "-f", "mp4", path.join(dir, "ten.mp4"))
  ff(...tenSeconds, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", ...TAGS, "-movflags", "use_metadata_tags", "-f", "mov", path.join(dir, "ten.mov"))
  ff(...tenSeconds, "-c:v", "libvpx-vp9", "-deadline", "realtime", "-c:a", "libopus", ...TAGS, "-f", "webm", path.join(dir, "ten.webm"))
  // The same ten seconds with no sound.
  ff("-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "mp4", path.join(dir, "silent.mp4"))
  // Sizes a browser can play but x264 can't encode as they are: an odd size, and one larger than 1080p.
  ff("-f", "lavfi", "-i", "testsrc=size=321x241:rate=10:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv444p", "-f", "mp4", path.join(dir, "odd.mp4"))
  ff("-f", "lavfi", "-i", "testsrc=size=3840x2160:rate=5:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-f", "mp4", path.join(dir, "uhd.mp4"))
  // A phone video held upright: the picture is stored sideways with a 90 degree rotation flag.
  ff("-f", "lavfi", "-i", "testsrc=size=320x240:rate=25:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-f", "mp4", path.join(dir, "flat.mp4"))
  ff("-display_rotation", "90", "-i", path.join(dir, "flat.mp4"), "-c", "copy", "-f", "mp4", path.join(dir, "turned.mp4"))
  sources["video/mp4"] = path.join(dir, "ten.mp4")
  sources["video/quicktime"] = path.join(dir, "ten.mov")
  sources["video/webm"] = path.join(dir, "ten.webm")
})

after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true })
})

function workFolders() {
  return fs.readdirSync(os.tmpdir()).filter((entry) => entry.startsWith("rhenko-video-") && !entry.startsWith("rhenko-video-test-"))
}

// The cut the server makes for this window, with the same check on the length that lib/uploads.ts passes.
function cutOf(start, end, over = {}) {
  return { start, end, maxSeconds: MAX, maxBytes: 100 * 1024 * 1024, check: (duration) => trimProblem({ start, end }, MAX, duration), ...over }
}

// Cuts a file and returns the cut, written next to it. Rejects when the cut is refused.
async function cut(file, mime, start, end, over) {
  const out = path.join(dir, `cut-${start}-${end}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`)
  const blob = await fs.openAsBlob(file, { type: mime })
  await withCleanVideo(
    blob,
    mime,
    async (clean) => {
      assert.equal(clean.type, "video/mp4", "the cut is an MP4 whatever the upload was")
      fs.writeFileSync(out, Buffer.from(await clean.arrayBuffer()))
    },
    cutOf(start, end, over)
  )
  return out
}

function secondsOf(info) {
  return Number(info.format.duration)
}

test("a 10 second MP4 cut from 2 to 5 seconds is about 3 seconds, as H.264 and AAC in an MP4", { skip }, async () => {
  const before = workFolders()
  const out = await cut(sources["video/mp4"], "video/mp4", 2, 5)
  const info = probe(out)

  assert.ok(Math.abs(secondsOf(info) - 3) < 0.1, `the cut is ${secondsOf(info)} seconds`)
  assert.match(info.format.format_name, /mp4/)
  const video = info.streams.find((stream) => stream.codec_type === "video")
  const audio = info.streams.find((stream) => stream.codec_type === "audio")
  assert.equal(video.codec_name, "h264")
  assert.equal(video.pix_fmt, "yuv420p")
  assert.equal(audio.codec_name, "aac")
  assert.equal(info.streams.length, 2)
  assert.equal(video.width, 320)
  assert.equal(video.height, 240)
  // 25 frames a second for 3 seconds. The cut lands on the exact frame, so the count is exact too.
  const frames = framesOf(out)
  assert.ok(frames >= 74 && frames <= 76, `${frames} frames`)
  // Every frame decodes without a complaint.
  const decode = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-i", out, "-f", "null", "-"], { encoding: "utf8" })
  assert.equal(decode.status, 0)
  assert.equal(decode.stderr.trim(), "")
  // The moov box comes first, so the cut plays as it loads.
  const boxes = bytesOf(out)
  assert.ok(boxes.indexOf("moov") !== -1 && boxes.indexOf("moov") < boxes.indexOf("mdat"), "faststart")
  assert.deepEqual(workFolders(), before, "the working folder is deleted")
})

test("the cut starts on the frame at 2 seconds and ends before the frame at 5", { skip }, async () => {
  const out = await cut(sources["video/mp4"], "video/mp4", 2, 5)
  const first = pictureAt(out, 0)
  const last = pictureAt(out, 2.9)
  const sameAsStart = difference(first, pictureAt(sources["video/mp4"], 2))
  const halfSecondOff = difference(first, pictureAt(sources["video/mp4"], 2.5))
  assert.ok(sameAsStart < halfSecondOff / 3, `first frame matches the source at 2s (${sameAsStart.toFixed(1)} against ${halfSecondOff.toFixed(1)} half a second on)`)
  assert.ok(difference(last, pictureAt(sources["video/mp4"], 4.9)) < difference(last, pictureAt(sources["video/mp4"], 5.5)), "the last frame is from just before 5s")
})

test("a cut carries no location, device, time, title or extra detail", { skip }, async () => {
  const out = await cut(sources["video/mp4"], "video/mp4", 2, 5)
  const raw = bytesOf(out)
  for (const secret of SECRETS) assert.ok(!raw.includes(secret), `${secret} is not in the cut`)
  const info = probe(out)
  const tags = [info.format, ...info.streams].flatMap((part) => Object.entries(part?.tags ?? {}))
  assert.ok(tags.every(([key]) => HARMLESS_TAGS.has(key.toLowerCase())), `only harmless tags are left: ${JSON.stringify(tags)}`)
  assert.equal(probe(sources["video/mp4"]).chapters.length, 1, "the test video has a chapter")
  assert.deepEqual(info.chapters, [], "the chapter is gone")
})

for (const mime of ["video/quicktime", "video/webm"]) {
  test(`${mime}: cut from 2 to 5 seconds is a 3 second MP4`, { skip }, async () => {
    const out = await cut(sources[mime], mime, 2, 5)
    const info = probe(out)
    assert.ok(Math.abs(secondsOf(info) - 3) < 0.15, `the cut is ${secondsOf(info)} seconds`)
    assert.match(info.format.format_name, /mp4/)
    assert.deepEqual(info.streams.map((stream) => stream.codec_name).sort(), ["aac", "h264"])
    const raw = bytesOf(out)
    for (const secret of SECRETS) assert.ok(!raw.includes(secret), `${secret} is not in the cut`)
  })
}

test("a video with no sound can be cut", { skip }, async () => {
  const out = await cut(path.join(dir, "silent.mp4"), "video/mp4", 1, 3)
  const info = probe(out)
  assert.ok(Math.abs(secondsOf(info) - 2) < 0.1)
  assert.deepEqual(info.streams.map((stream) => stream.codec_type), ["video"])
})

test("the whole video, and a cut that runs a few hundredths past the end, can be cut", { skip }, async () => {
  const whole = await cut(sources["video/mp4"], "video/mp4", 0, 10)
  assert.ok(Math.abs(secondsOf(probe(whole)) - 10) < 0.15)
  // The browser's reading of the length and ffprobe's can differ a little. The cut runs to the real end.
  const past = await cut(sources["video/mp4"], "video/mp4", 8, 10.3)
  assert.ok(Math.abs(secondsOf(probe(past)) - 2) < 0.15)
})

test("an odd-sized or very large picture comes out an even size that fits 1920 by 1920", { skip }, async () => {
  const odd = probe(await cut(path.join(dir, "odd.mp4"), "video/mp4", 0, 1.5))
  const oddVideo = odd.streams.find((stream) => stream.codec_type === "video")
  assert.equal(oddVideo.width % 2, 0)
  assert.equal(oddVideo.height % 2, 0)
  assert.ok(oddVideo.width >= 320 && oddVideo.height >= 240)
  assert.equal(oddVideo.pix_fmt, "yuv420p")

  const big = probe(await cut(path.join(dir, "uhd.mp4"), "video/mp4", 0, 1.2))
  const bigVideo = big.streams.find((stream) => stream.codec_type === "video")
  assert.equal(bigVideo.width, 1920)
  assert.equal(bigVideo.height, 1080)
})

test("a video held sideways with a rotation flag comes out the right way up with no flag", { skip }, async () => {
  const flagged = probe(path.join(dir, "turned.mp4")).streams[0]
  const was = flagged.side_data_list?.find((entry) => "rotation" in entry)?.rotation ?? Number(flagged.tags?.rotate ?? 0)
  assert.ok(Math.abs(was) === 90, "the test video carries a rotation")
  const out = probe(await cut(path.join(dir, "turned.mp4"), "video/mp4", 0, 2))
  const video = out.streams.find((stream) => stream.codec_type === "video")
  assert.equal(video.width, 240)
  assert.equal(video.height, 320)
  assert.ok(!video.side_data_list?.some((entry) => "rotation" in entry && entry.rotation !== 0), "no rotation flag is left")
})

test("windows that don't fit the video are refused before anything is handed on or left on disk", { skip }, async (t) => {
  t.mock.method(console, "error", () => undefined)
  const before = workFolders()
  const windows = [
    [8, 12, /ends after the video/, "past the end"],
    [11, 12, /starts after the video/, "starting after the end"],
    [10, 11, /starts after the video/, "starting at the end"],
    [5, 5, /start before it ends/, "start equal to end"],
    [5, 2, /start before it ends/, "start after end"],
    [-1, 4, /before the video/, "negative start"],
    [Number.NaN, 4, /start and an end/, "NaN start"],
    [2, Number.NaN, /start and an end/, "NaN end"],
    [0, Number.POSITIVE_INFINITY, /start and an end/, "infinite end"],
    [0, 0.5, /at least 1 second/, "under a second"],
  ]
  for (const [start, end, message, what] of windows) {
    let called = false
    await assert.rejects(
      withCleanVideo(await fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" }), "video/mp4", async () => { called = true }, cutOf(start, end)),
      (error) => error instanceof VideoRefused && message.test(error.message),
      what
    )
    assert.equal(called, false, `${what}: nothing is stored`)
  }

  // A window longer than the limit, on a limit small enough to test with a 10 second video.
  let called = false
  await assert.rejects(
    withCleanVideo(
      await fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" }),
      "video/mp4",
      async () => { called = true },
      { start: 1, end: 8, maxSeconds: 5, maxBytes: 1 << 20, check: (duration) => trimProblem({ start: 1, end: 8 }, 5, duration) }
    ),
    (error) => error instanceof VideoRefused && /up to 5 seconds/.test(error.message),
    "too long"
  )
  assert.equal(called, false)
  assert.deepEqual(workFolders(), before)
})

test("even when the caller's check lets a bad window through, the cut is refused", { skip }, async (t) => {
  t.mock.method(console, "error", () => undefined)
  const before = workFolders()
  const blob = () => fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" })
  const nothing = async () => { throw new Error("must not be handed on") }
  const noCheck = () => null

  // Numbers ffmpeg can't read.
  for (const [start, end] of [[Number.NaN, 4], [2, Number.NaN]]) {
    await assert.rejects(withCleanVideo(await blob(), "video/mp4", nothing, cutOf(start, end, { check: noCheck })), VideoRefused)
  }
  // A cut longer than the limit is measured after the fact and refused. This one asks for 7 seconds on a 3 second limit.
  await assert.rejects(
    withCleanVideo(await blob(), "video/mp4", nothing, cutOf(1, 8, { check: noCheck, maxSeconds: 3 })),
    (error) => error instanceof VideoRefused && /couldn't be trimmed/.test(error.message)
  )
  // A cut that grows past the size limit is refused, not left shortened.
  await assert.rejects(
    withCleanVideo(await blob(), "video/mp4", nothing, cutOf(0, 10, { maxBytes: 4000 })),
    (error) => error instanceof VideoRefused && /too big/.test(error.message)
  )
  assert.deepEqual(workFolders(), before)
})

test("a file that is not a video, and a video that has no readable length, are refused", { skip }, async (t) => {
  t.mock.method(console, "error", () => undefined)
  const before = workFolders()
  const nothing = async () => { throw new Error("must not be handed on") }
  await assert.rejects(withCleanVideo(new Blob(["this is not a video at all"]), "video/mp4", nothing, cutOf(0, 3)), VideoRefused)
  await assert.rejects(
    withCleanVideo(new Blob([Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(12)])]), "video/mp4", nothing, cutOf(0, 3)),
    VideoRefused
  )
  // A WebM with no length written into it, as a browser's recorder makes one: ffmpeg can't go back to write the length when its
  // output is a pipe.
  const unknown = path.join(dir, "no-length.webm")
  fs.writeFileSync(
    unknown,
    execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-i", sources["video/webm"], "-map_metadata", "-1", "-c", "copy", "-f", "webm", "pipe:1"], { maxBuffer: 1 << 24 })
  )
  assert.ok([undefined, "N/A"].includes(probe(unknown).format.duration), "the test video has no length")
  await assert.rejects(
    withCleanVideo(await fs.openAsBlob(unknown, { type: "video/webm" }), "video/webm", nothing, cutOf(0, 3)),
    (error) => error instanceof VideoRefused && /length can't be read/.test(error.message)
  )
  await assert.rejects(withCleanVideo(new Blob(["x"]), "image/png", nothing, cutOf(0, 3)), VideoRefused)
  assert.deepEqual(workFolders(), before)
})

test("a server without ffmpeg or ffprobe refuses the cut", { skip }, async (t) => {
  t.mock.method(console, "error", () => undefined)
  const path_ = process.env.PATH
  process.env.PATH = path.join(dir, "no-such-folder")
  try {
    let called = false
    await assert.rejects(
      withCleanVideo(await fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" }), "video/mp4", async () => { called = true }, cutOf(2, 5)),
      (error) => error instanceof VideoRefused && /can't be uploaded right now/.test(error.message)
    )
    assert.equal(called, false)
  } finally {
    process.env.PATH = path_
  }
})

test("an error from the callback goes on unchanged after a cut, and the working folder is still deleted", { skip }, async () => {
  const before = workFolders()
  const failure = new Error("storage is down")
  await assert.rejects(
    withCleanVideo(
      await fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" }),
      "video/mp4",
      async () => {
        assert.equal(workFolders().length, before.length + 1, "the folder exists while the callback runs")
        throw failure
      },
      cutOf(2, 5)
    ),
    (error) => error === failure
  )
  assert.deepEqual(workFolders(), before)
})

test("without a cut, a video is still only cleaned: same type, same length", { skip }, async () => {
  const out = path.join(dir, "uncut.mp4")
  await withCleanVideo(await fs.openAsBlob(sources["video/mp4"], { type: "video/mp4" }), "video/mp4", async (clean) => {
    assert.equal(clean.type, "video/mp4")
    fs.writeFileSync(out, Buffer.from(await clean.arrayBuffer()))
  })
  assert.ok(Math.abs(secondsOf(probe(out)) - 10) < 0.1)
})
