import { ellipsize, fitLines, wrapText } from "@/lib/post-card"
import type { MediaKind } from "@/lib/uploads"

// Draws a post as a picture, the way a screenshot of it looks: the author, the words, and the first photo or video (a video is
// its first frame, with no play button). It takes this page's own colours and type, so it matches the post on the screen, light
// or dark. It is drawn on a canvas in this browser, so the picture is made here and sent nowhere.

export type PicturePost = {
  id: string
  body: string
  author: { name: string; handle: string; avatarFile: string | null }
  media: { file: string; kind: MediaKind }[]
}

// Something that can be drawn from: a loaded picture, or a video's current frame.
type Frame = { source: CanvasImageSource; width: number; height: number }

const WIDTH = 1080
const PAD = 80
const SCALE = 2
const AVATAR = 96
const GAP = 40
const NAME = 40
const HANDLE = 30
const BODY = 44
const BODY_LINE = 60
const BODY_MAX_LINES = 12
const MEDIA_MAX = 960
const MEDIA_RADIUS = 28

export async function makePostPicture(post: PicturePost): Promise<Blob> {
  const style = getComputedStyle(document.documentElement)
  const colour = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const paper = colour("--background", "#f6f3ec")
  const ink = colour("--foreground", "#1f1d19")
  const muted = colour("--muted-foreground", "#6d675b")

  const family = getComputedStyle(document.body).fontFamily || "sans-serif"
  const face = (weight: number, size: number) => `${weight} ${size}px ${family}`
  await loadFaces([face(400, BODY), face(600, NAME)])

  const first = post.media.find((item) => item.kind === "image" || item.kind === "video") ?? null
  const [avatar, media] = await Promise.all([
    post.author.avatarFile ? loadFrame(`/media/${post.author.avatarFile}?w=160`, "image") : Promise.resolve(null),
    first ? loadFrame(first.kind === "video" ? `/media/${first.file}` : `/media/${first.file}?w=1280`, first.kind) : Promise.resolve(null),
  ])

  // Layout first, so the picture is exactly as tall as what is in it.
  const meter = document.createElement("canvas").getContext("2d")
  if (!meter) throw new Error("This browser can't draw a picture.")
  const measurer = (font: string) => (text: string) => {
    meter.font = font
    return meter.measureText(text).width
  }
  const textWidth = WIDTH - PAD * 2
  const nameWidth = textWidth - AVATAR - 28
  const body = post.body.trim()
  const bodyMeasure = measurer(face(400, BODY))
  const lines = body ? fitLines(wrapText(body, textWidth, bodyMeasure), BODY_MAX_LINES, textWidth, bodyMeasure) : []
  const mediaHeight = media ? Math.min((textWidth * media.height) / media.width, MEDIA_MAX) : 0

  const bodyTop = PAD + AVATAR + GAP
  const mediaTop = (lines.length ? bodyTop + lines.length * BODY_LINE : PAD + AVATAR) + GAP
  const bottom = media ? mediaTop + mediaHeight : lines.length ? bodyTop + lines.length * BODY_LINE : PAD + AVATAR
  const height = bottom + PAD

  const canvas = document.createElement("canvas")
  canvas.width = WIDTH * SCALE
  canvas.height = Math.ceil(height * SCALE)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser can't draw a picture.")
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, WIDTH, height)

  // The avatar: the photo in a circle, or the initials on the ink colour when there is no photo.
  ctx.save()
  ctx.beginPath()
  ctx.arc(PAD + AVATAR / 2, PAD + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    drawCover(ctx, avatar, PAD, PAD, AVATAR, AVATAR)
  } else {
    ctx.fillStyle = ink
    ctx.fillRect(PAD, PAD, AVATAR, AVATAR)
    ctx.fillStyle = paper
    ctx.font = face(600, 36)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(initialsOf(post.author.name), PAD + AVATAR / 2, PAD + AVATAR / 2)
  }
  ctx.restore()

  const left = PAD + AVATAR + 28
  ctx.fillStyle = ink
  ctx.font = face(600, NAME)
  ctx.fillText(ellipsize(post.author.name, nameWidth, measurer(face(600, NAME))), left, PAD + 38)
  ctx.fillStyle = muted
  ctx.font = face(400, HANDLE)
  ctx.fillText(ellipsize(`@${post.author.handle}`, nameWidth, measurer(face(400, HANDLE))), left, PAD + 80)

  if (lines.length) {
    ctx.fillStyle = ink
    ctx.font = face(400, BODY)
    lines.forEach((line, index) => ctx.fillText(line, PAD, bodyTop + BODY + index * BODY_LINE))
  }

  if (media) {
    ctx.save()
    roundedPath(ctx, PAD, mediaTop, textWidth, mediaHeight, MEDIA_RADIUS)
    ctx.clip()
    drawCover(ctx, media, PAD, mediaTop, textWidth, mediaHeight)
    ctx.restore()
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The picture could not be made."))), "image/png")
  )
}

async function loadFaces(faces: string[]): Promise<void> {
  try {
    await Promise.all(faces.map((face) => document.fonts.load(face)))
  } catch {
    // The picture is drawn with the type the page has.
  }
}

// A picture, or for a video the frame shown a moment in (the first frame can be black). A file that won't load gives null, and
// the picture is drawn without it.
function loadFrame(src: string, kind: MediaKind): Promise<Frame | null> {
  return kind === "video" ? loadVideoFrame(src) : loadPicture(src)
}

function loadPicture(src: string): Promise<Frame | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function loadVideoFrame(src: string): Promise<Frame | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    video.preload = "auto"
    const finish = (frame: Frame | null) => {
      video.removeAttribute("src")
      video.load()
      resolve(frame)
    }
    const timer = window.setTimeout(() => finish(null), 8000)
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, video.duration || 0)
    }
    video.onseeked = () => {
      window.clearTimeout(timer)
      finish(video.videoWidth && video.videoHeight ? { source: video, width: video.videoWidth, height: video.videoHeight } : null)
    }
    video.onerror = () => {
      window.clearTimeout(timer)
      finish(null)
    }
    video.src = src
  })
}

// Fills a box with the frame, cropped from the middle so it keeps its shape.
function drawCover(ctx: CanvasRenderingContext2D, frame: Frame, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / frame.width, h / frame.height)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(frame.source, (frame.width - sw) / 2, (frame.height - sh) / 2, sw, sh, x, y, w, h)
}

function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  return ((words[0][0] ?? "") + (words.length > 1 ? (words[1][0] ?? "") : "")).toUpperCase()
}
