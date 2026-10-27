import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import type { ReadableStream as WebReadableStream } from "node:stream/web"
import { pipeline } from "node:stream/promises"

// Removes the information a video carries about where and how it was recorded: location (for example
// com.apple.quicktime.location.ISO6709 and the ©xyz box), device make and model, creation time, titles, comments, chapters,
// and the extra tracks phones add (timed GPS and motion data, subtitles, cover pictures). The picture and the sound are copied
// as they are, with no re-encoding, and the rotation stays so the video still plays the right way up. The cleaning is done by
// ffmpeg, which has to be installed on the server (the Dockerfile adds it). This step fails closed: when ffmpeg is missing or
// cannot read the file, the video is refused, and the original is never stored.
//
// A video can also be cut down to a part of itself (a trim). That pass has to decode and encode, because a cut that lands on the
// exact frame can't be made by copying, so the cut part is rewritten as H.264 and AAC in an MP4, in the same pass that removes
// the details. The trim comes from the browser, so it is checked against the length ffprobe reads from the file, and the finished
// cut is measured again before it is handed on. A cut that fails is refused; the uncut video is never stored in its place.
//
// Nothing here holds the whole video in memory. The upload is streamed to a file in a fresh temporary folder, ffmpeg reads
// and writes files on disk, and the cleaned file is handed on as a file-backed Blob that the storage layer streams out. The
// folder is deleted when the caller is done with the file, whether it worked or not.

// What a person is told. The details go to the server log.
const UNREADABLE = "That video couldn't be read. Export it again as an MP4, MOV or WebM and try again."
const UNAVAILABLE = "Videos can't be uploaded right now. Try again later."
const TOO_LONG = "That video took too long to prepare. Try a shorter one."
const INCOMPLETE = "That file didn't finish uploading. Try again."
const TRIM_FAILED = "That video couldn't be trimmed. Pick another part, or export it again as an MP4."
const TRIM_TOO_LONG = "Trimming that video took too long. Pick a shorter part."
const TRIM_TOO_BIG = "That part of the video is too big to post. Pick a shorter part."
const NO_LENGTH = "That video's length can't be read, so it can't be trimmed. Post it as it is, or export it again as an MP4."

// An error whose message is safe to show to the person who uploaded the video.
export class VideoRefused extends Error {}

type Container = { ext: string; demuxer: string; muxer: string }

// The container is forced on the way in and on the way out. ffmpeg then never guesses a format from the bytes, so a file that
// is really a playlist or a text file cannot make it open other files or addresses, and a file that is not what it says is
// refused. QuickTime and MP4 share a demuxer.
const CONTAINERS: Record<string, Container> = {
  "video/mp4": { ext: "mp4", demuxer: "mov", muxer: "mp4" },
  "video/quicktime": { ext: "mov", demuxer: "mov", muxer: "mov" },
  "video/webm": { ext: "webm", demuxer: "matroska", muxer: "webm" },
}

const FFMPEG = "ffmpeg"
const FFPROBE = "ffprobe"
// Copying streams runs at disk speed: a 100 MB video takes a second or two. A minute is far more than it needs.
const TIMEOUT_MS = 60_000
// A copy is about as big as the original. This much more is allowed for a different box layout; anything bigger is refused.
const EXTRA_BYTES = 2 * 1024 * 1024
const LOG_BYTES = 4000
// A cut decodes and encodes, which runs at a fraction of disk speed: 35 seconds of 1080p took 15 seconds on two cores, so 140
// seconds takes about a minute, and twice that when two cuts share the cores. Three minutes is room for that on a small server;
// a cut that needs more is refused rather than left holding a worker.
const CUT_TIMEOUT_MS = 180_000
const PROBE_TIMEOUT_MS = 15_000
// The longest side of a cut video. A 4K upload is brought down to 1080p, which is also what keeps the encode inside its time.
const CUT_MAX_SIDE = 1920
// How much longer than asked a finished cut may be before it is refused. Audio frames can run a little past the last picture.
const CUT_OVER_SECONDS = 1
// Videos prepared at once in one server process. Each holds up to two copies of the video on disk while it is worked on.
const MAX_AT_ONCE = 2

let running = 0
const waiting: Array<() => void> = []

async function limited<T>(work: () => Promise<T>): Promise<T> {
  while (running >= MAX_AT_ONCE) await new Promise<void>((resolve) => waiting.push(resolve))
  running += 1
  try {
    return await work()
  } finally {
    running -= 1
    waiting.shift()?.()
  }
}

// The arguments are a list, never a shell line, so nothing in a file name or a type can be read as a command.
function ffmpegArguments(input: string, output: string, container: Container, maxBytes: number): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    // Only plain files, even if a file's contents ask for an address.
    "-protocol_whitelist", "file",
    "-f", container.demuxer,
    "-i", input,
    // Pictures and sound only. 0:V leaves out cover pictures. Data, subtitle and attachment tracks are not mapped at all.
    "-map", "0:V?",
    "-map", "0:a?",
    // Drop the file's own details, each track's details and the chapters.
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-c", "copy",
    // No ffmpeg version or build date in the output.
    "-fflags", "+bitexact",
    // MP4 and MOV: the index (the moov box) goes before the picture and sound. ffmpeg otherwise writes it at the end, and a
    // phone then has to fetch the end of the file before it can show the first frame or seek.
    ...(container.muxer === "mp4" || container.muxer === "mov" ? ["-movflags", "+faststart"] : []),
    "-fs", String(maxBytes),
    "-f", container.muxer,
    output,
  ]
}

// What a cut is: keep the video from `start` to `end` (seconds) and nothing else.
export type VideoCut = {
  start: number
  end: number
  // The longest the stored video may run, and the most it may weigh. A cut over either is refused, never shortened.
  maxSeconds: number
  maxBytes: number
  // Looks at the length ffprobe read from the file and says why the cut can't be made, or null when it can. The window came from
  // the browser, so this is where it meets the real video.
  check: (duration: number) => string | null
}

// The arguments for a cut. -ss and -to come before -i, so ffmpeg seeks to the nearest earlier key frame and then decodes up to the
// start, which lands the cut on the exact frame. The picture is scaled down to fit 1920 by 1920 and made an even size in 4:2:0,
// the one form every browser plays. Only the first picture and the first sound are kept, with no details, chapters or cover.
function cutArguments(input: string, output: string, container: Container, cut: VideoCut, end: number): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-protocol_whitelist", "file",
    "-ss", cut.start.toFixed(3),
    "-to", end.toFixed(3),
    "-f", container.demuxer,
    "-i", input,
    "-map", "0:V:0",
    "-map", "0:a:0?",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    // Rotation is applied to the picture by ffmpeg, so the cut carries no rotation flag and plays upright everywhere.
    "-vf", `scale=w='min(${CUT_MAX_SIDE},iw)':h='min(${CUT_MAX_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    "-movflags", "+faststart",
    "-fflags", "+bitexact",
    "-fs", String(cut.maxBytes),
    "-f", "mp4",
    output,
  ]
}

type Outcome =
  | { kind: "done"; out: string }
  | { kind: "failed"; detail: string }
  | { kind: "timeout" }
  | { kind: "missing"; detail: string }

// Runs ffmpeg or ffprobe and waits for it. Whatever it writes to its standard output comes back, up to a few thousand characters.
function runTool(command: string, args: string[], timeoutMs: number): Promise<Outcome> {
  return new Promise((resolve) => {
    let log = ""
    let out = ""
    let timedOut = false
    let settled = false
    const finish = (outcome: Outcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(outcome)
    }
    // The tool gets nothing from the server's environment but the search path (and NODE_ENV, which the types ask for and holds no secret).
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" },
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      if (out.length < LOG_BYTES) out += chunk
    })
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      if (log.length < LOG_BYTES) log += chunk
    })
    child.on("error", (error) => finish({ kind: "missing", detail: String(error) }))
    child.on("close", (code, signal) => {
      if (timedOut) finish({ kind: "timeout" })
      else if (code === 0) finish({ kind: "done", out })
      else finish({ kind: "failed", detail: `exit ${code ?? signal}: ${log.slice(0, LOG_BYTES)}` })
    })
  })
}

// The length of a video file in seconds, as ffprobe reads it from the container. Throws VideoRefused when ffprobe is missing or
// cannot give a length (a recording with no length written into it, for one).
async function lengthOf(file: string, container: Container, refusal: string): Promise<number> {
  const outcome = await runTool(
    FFPROBE,
    ["-v", "error", "-protocol_whitelist", "file", "-f", container.demuxer, "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    PROBE_TIMEOUT_MS
  )
  if (outcome.kind === "missing") {
    console.error("[video] ffprobe could not be started. Is it installed?", outcome.detail)
    throw new VideoRefused(UNAVAILABLE)
  }
  if (outcome.kind !== "done") {
    console.error("[video] ffprobe could not read the file", outcome.kind === "failed" ? outcome.detail : "timed out")
    throw new VideoRefused(refusal)
  }
  const seconds = Number(outcome.out.trim())
  if (!Number.isFinite(seconds) || seconds <= 0) {
    console.error("[video] ffprobe found no length", outcome.out.slice(0, 80))
    throw new VideoRefused(refusal)
  }
  return seconds
}

function refuseFailed(outcome: Exclude<Outcome, { kind: "done" }>, unreadable: string, tooLong: string): never {
  if (outcome.kind === "missing") {
    console.error("[video] ffmpeg could not be started. Is it installed?", outcome.detail)
    throw new VideoRefused(UNAVAILABLE)
  }
  if (outcome.kind === "timeout") {
    console.error("[video] ffmpeg timed out")
    throw new VideoRefused(tooLong)
  }
  console.error("[video] ffmpeg refused the file", outcome.detail)
  throw new VideoRefused(unreadable)
}

async function sizeOf(file: string): Promise<number> {
  return (await fs.promises.stat(file).catch(() => null))?.size ?? 0
}

// Copies the picture and sound into `output` without the details.
async function stripInto(input: string, output: string, container: Container, video: Blob): Promise<void> {
  const outcome = await runTool(FFMPEG, ffmpegArguments(input, output, container, video.size + EXTRA_BYTES), TIMEOUT_MS)
  if (outcome.kind !== "done") refuseFailed(outcome, UNREADABLE, TOO_LONG)

  // ffmpeg can exit cleanly and still leave nothing, or stop at its size limit with a cut file.
  const size = await sizeOf(output)
  if (size === 0 || size >= video.size + EXTRA_BYTES) {
    console.error("[video] ffmpeg wrote an unusable file", size)
    throw new VideoRefused(UNREADABLE)
  }
}

// Cuts the part the person chose into `output` as an MP4, without the details.
async function cutInto(input: string, output: string, container: Container, cut: VideoCut): Promise<void> {
  // The window is checked against the real length first, so a cut that asks for more than the video holds never starts.
  const duration = await lengthOf(input, container, NO_LENGTH)
  const problem = cut.check(duration)
  if (problem) throw new VideoRefused(problem)

  const outcome = await runTool(FFMPEG, cutArguments(input, output, container, cut, Math.min(cut.end, duration)), CUT_TIMEOUT_MS)
  if (outcome.kind !== "done") refuseFailed(outcome, TRIM_FAILED, TRIM_TOO_LONG)

  const size = await sizeOf(output)
  if (size === 0) {
    console.error("[video] ffmpeg wrote no cut")
    throw new VideoRefused(TRIM_FAILED)
  }
  // Stopping at the size limit leaves a file of about that size, with the end missing.
  if (size >= cut.maxBytes) {
    console.error("[video] the cut reached the size limit", size)
    throw new VideoRefused(TRIM_TOO_BIG)
  }
  // What goes on is measured, not assumed: a cut longer than the limit never reaches storage, whatever the window said.
  const made = await lengthOf(output, { ext: "mp4", demuxer: "mov", muxer: "mp4" }, TRIM_FAILED)
  if (made > cut.maxSeconds + CUT_OVER_SECONDS) {
    console.error("[video] the cut is longer than allowed", made)
    throw new VideoRefused(TRIM_FAILED)
  }
}

// Calls `receive` with a copy of the video that has no metadata, as a Blob read from disk. With a `cut` the copy is only that
// part of the video, re-encoded as an MP4 (its Blob type is video/mp4, whatever the upload was). The copy is deleted when
// `receive` ends, so `receive` must finish with it (the upload to storage has to complete) before it returns. Throws
// VideoRefused when the video cannot be cleaned or cut; anything `receive` throws goes on unchanged.
export async function withCleanVideo<T>(video: Blob, mime: string, receive: (clean: Blob) => Promise<T>, cut: VideoCut | null = null): Promise<T> {
  const container = CONTAINERS[mime]
  if (!container) throw new VideoRefused(UNREADABLE)
  return await limited(async () => {
    let dir: string
    try {
      dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rhenko-video-"))
    } catch (error) {
      console.error("[video] could not make a working folder", error)
      throw new VideoRefused(UNAVAILABLE)
    }
    try {
      const input = path.join(dir, `in.${container.ext}`)
      const outType = cut ? "video/mp4" : mime
      const output = path.join(dir, `out.${cut ? "mp4" : container.ext}`)

      try {
        await pipeline(Readable.fromWeb(video.stream() as unknown as WebReadableStream), fs.createWriteStream(input, { mode: 0o600 }))
      } catch (error) {
        console.error("[video] could not copy the upload to disk", error)
        throw new VideoRefused(INCOMPLETE)
      }

      if (cut) await cutInto(input, output, container, cut)
      else await stripInto(input, output, container, video)

      const clean = await fs.openAsBlob(output, { type: outType })
      return await receive(clean)
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch((error) => console.error("[video] could not remove", dir, error))
    }
  })
}
