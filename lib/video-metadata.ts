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
// Nothing here holds the whole video in memory. The upload is streamed to a file in a fresh temporary folder, ffmpeg reads
// and writes files on disk, and the cleaned file is handed on as a file-backed Blob that the storage layer streams out. The
// folder is deleted when the caller is done with the file, whether it worked or not.

// What a person is told. The details go to the server log.
const UNREADABLE = "That video couldn't be read. Export it again as an MP4, MOV or WebM and try again."
const UNAVAILABLE = "Videos can't be uploaded right now. Try again later."
const TOO_LONG = "That video took too long to prepare. Try a shorter one."
const INCOMPLETE = "That file didn't finish uploading. Try again."

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
// Copying streams runs at disk speed: a 100 MB video takes a second or two. A minute is far more than it needs.
const TIMEOUT_MS = 60_000
// A copy is about as big as the original. This much more is allowed for a different box layout; anything bigger is refused.
const EXTRA_BYTES = 2 * 1024 * 1024
const LOG_BYTES = 4000
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

type Outcome = { kind: "done" } | { kind: "failed"; detail: string } | { kind: "timeout" } | { kind: "missing"; detail: string }

function runFfmpeg(args: string[]): Promise<Outcome> {
  return new Promise((resolve) => {
    let log = ""
    let timedOut = false
    let settled = false
    const finish = (outcome: Outcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(outcome)
    }
    // ffmpeg gets nothing from the server's environment but the search path (and NODE_ENV, which the types ask for and holds no secret).
    const child = spawn(FFMPEG, args, {
      stdio: ["ignore", "ignore", "pipe"],
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" },
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, TIMEOUT_MS)
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      if (log.length < LOG_BYTES) log += chunk
    })
    child.on("error", (error) => finish({ kind: "missing", detail: String(error) }))
    child.on("close", (code, signal) => {
      if (timedOut) finish({ kind: "timeout" })
      else if (code === 0) finish({ kind: "done" })
      else finish({ kind: "failed", detail: `exit ${code ?? signal}: ${log.slice(0, LOG_BYTES)}` })
    })
  })
}

// Calls `receive` with a copy of the video that has no metadata, as a Blob read from disk. The copy is deleted when `receive` ends,
// so `receive` must finish with it (the upload to storage has to complete) before it returns. Throws VideoRefused when the video
// cannot be cleaned; anything `receive` throws goes on unchanged.
export async function withCleanVideo<T>(video: Blob, mime: string, receive: (clean: Blob) => Promise<T>): Promise<T> {
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
      const output = path.join(dir, `out.${container.ext}`)

      try {
        await pipeline(Readable.fromWeb(video.stream() as unknown as WebReadableStream), fs.createWriteStream(input, { mode: 0o600 }))
      } catch (error) {
        console.error("[video] could not copy the upload to disk", error)
        throw new VideoRefused(INCOMPLETE)
      }

      const outcome = await runFfmpeg(ffmpegArguments(input, output, container, video.size + EXTRA_BYTES))
      if (outcome.kind === "missing") {
        console.error("[video] ffmpeg could not be started. Is it installed?", outcome.detail)
        throw new VideoRefused(UNAVAILABLE)
      }
      if (outcome.kind === "timeout") {
        console.error("[video] ffmpeg timed out")
        throw new VideoRefused(TOO_LONG)
      }
      if (outcome.kind === "failed") {
        console.error("[video] ffmpeg refused the file", outcome.detail)
        throw new VideoRefused(UNREADABLE)
      }

      // ffmpeg can exit cleanly and still leave nothing, or stop at its size limit with a cut file.
      const size = (await fs.promises.stat(output).catch(() => null))?.size ?? 0
      if (size === 0 || size >= video.size + EXTRA_BYTES) {
        console.error("[video] ffmpeg wrote an unusable file", size)
        throw new VideoRefused(UNREADABLE)
      }
      const clean = await fs.openAsBlob(output, { type: mime })
      return await receive(clean)
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch((error) => console.error("[video] could not remove", dir, error))
    }
  })
}
