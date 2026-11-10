import { createElement } from "react"
import { Bookmark, ChartNoAxesColumn, Heart, MessageCircle, Repeat2, type LucideIcon } from "lucide-react"
import { ellipsize, fitLines, wrapText } from "@/lib/post-card"
import type { MediaKind } from "@/lib/uploads"

// Draws a post as a picture, laid out like the post on the screen: the author with the Rhenko mark at the top right, the words,
// the first photo or video (a video is its first frame, with no play button), and the row of actions with the view count. It
// takes this page's own colours and type, so it matches light or dark. It is drawn on a canvas in this browser, so the picture
// is made here and sent nowhere.

export type PicturePost = {
  id: string
  body: string
  views: number
  author: { name: string; handle: string; avatarFile: string | null }
  media: { file: string; kind: MediaKind }[]
}

// Something that can be drawn from: a loaded picture, or a video's current frame.
type Frame = { source: CanvasImageSource; width: number; height: number }

const WIDTH = 1080
const OUTER = 60
const INNER = 48
const CARD_RADIUS = 48
const CONTENT_W = WIDTH - (OUTER + INNER) * 2
const CONTENT_X = OUTER + INNER
const CONTENT_Y = OUTER + INNER
const SCALE = 2
const AVATAR = 88
const NAME = 36
const HANDLE = 30
const BODY = 40
const BODY_LINE = 56
const BODY_MAX_LINES = 12
const SECTION_GAP = 32
const MEDIA_MAX = 880
const MEDIA_RADIUS = 24
const LOGO_H = 52
const LOGO_W = (LOGO_H * 512) / 457
const ACTION = 34
const ACTION_COUNT = 28

export async function makePostPicture(post: PicturePost): Promise<Blob> {
  const style = getComputedStyle(document.documentElement)
  const colour = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const paper = colour("--background", "#f6f3ec")
  const ink = colour("--foreground", "#1f1d19")
  const muted = colour("--muted-foreground", "#6d675b")
  const rule = colour("--border", "#ddd7c9")

  const family = getComputedStyle(document.body).fontFamily || "sans-serif"
  const face = (weight: number, size: number) => `${weight} ${size}px ${family}`
  await loadFaces([face(400, BODY), face(600, NAME), face(400, ACTION_COUNT)])

  const first = post.media.find((item) => item.kind === "image" || item.kind === "video") ?? null
  const [avatar, media, mark, icons] = await Promise.all([
    post.author.avatarFile ? loadFrame(`/media/${post.author.avatarFile}?w=160`, "image") : Promise.resolve(null),
    first ? loadFrame(first.kind === "video" ? `/media/${first.file}` : `/media/${first.file}?w=1280`, first.kind) : Promise.resolve(null),
    loadMark(ink),
    loadIcons(muted),
  ])

  // Layout first, so the picture is exactly as tall as what is in it.
  const meter = document.createElement("canvas").getContext("2d")
  if (!meter) throw new Error("This browser can't draw a picture.")
  const measurer = (font: string) => (text: string) => {
    meter.font = font
    return meter.measureText(text).width
  }
  const body = post.body.trim()
  const bodyMeasure = measurer(face(400, BODY))
  const lines = body ? fitLines(wrapText(body, CONTENT_W, bodyMeasure), BODY_MAX_LINES, CONTENT_W, bodyMeasure) : []
  const mediaHeight = media ? Math.min((CONTENT_W * media.height) / media.width, MEDIA_MAX) : 0
  const views = String(post.views)
  const viewsWidth = measurer(face(400, ACTION_COUNT))(views)

  const headerBottom = CONTENT_Y + AVATAR
  const bodyTop = headerBottom + SECTION_GAP
  const bodyBottom = bodyTop + lines.length * BODY_LINE
  const mediaTop = (lines.length ? bodyBottom : headerBottom) + SECTION_GAP
  const mediaBottom = mediaTop + mediaHeight
  const actionsTop = (media ? mediaBottom : lines.length ? bodyBottom : headerBottom) + SECTION_GAP
  const cardBottom = actionsTop + ACTION + INNER
  const height = cardBottom + OUTER

  const canvas = document.createElement("canvas")
  canvas.width = WIDTH * SCALE
  canvas.height = Math.ceil(height * SCALE)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("This browser can't draw a picture.")
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = paper
  ctx.fillRect(0, 0, WIDTH, height)

  // The card: the page's paper inside a hairline, with rounded corners.
  roundedPath(ctx, OUTER, OUTER, WIDTH - OUTER * 2, cardBottom - OUTER, CARD_RADIUS)
  ctx.fillStyle = paper
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = rule
  ctx.stroke()

  // The avatar: the photo in a circle, or the initials on the ink colour when there is no photo.
  ctx.save()
  ctx.beginPath()
  ctx.arc(CONTENT_X + AVATAR / 2, CONTENT_Y + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2)
  ctx.clip()
  if (avatar) {
    drawCover(ctx, avatar, CONTENT_X, CONTENT_Y, AVATAR, AVATAR)
  } else {
    ctx.fillStyle = ink
    ctx.fillRect(CONTENT_X, CONTENT_Y, AVATAR, AVATAR)
    ctx.fillStyle = paper
    ctx.font = face(600, 34)
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(initialsOf(post.author.name), CONTENT_X + AVATAR / 2, CONTENT_Y + AVATAR / 2)
  }
  ctx.restore()

  // The name and handle, then the Rhenko mark at the top right where a post shows its own mark.
  const left = CONTENT_X + AVATAR + 24
  const nameWidth = CONTENT_W - AVATAR - 24 - LOGO_W - 24
  ctx.fillStyle = ink
  ctx.font = face(600, NAME)
  ctx.fillText(ellipsize(post.author.name, nameWidth, measurer(face(600, NAME))), left, CONTENT_Y + 38)
  ctx.fillStyle = muted
  ctx.font = face(400, HANDLE)
  ctx.fillText(ellipsize(`@${post.author.handle}`, nameWidth, measurer(face(400, HANDLE))), left, CONTENT_Y + 78)
  if (mark) {
    ctx.drawImage(mark.source, CONTENT_X + CONTENT_W - LOGO_W, CONTENT_Y + (AVATAR - LOGO_H) / 2, LOGO_W, LOGO_H)
  }

  if (lines.length) {
    ctx.fillStyle = ink
    ctx.font = face(400, BODY)
    lines.forEach((line, index) => ctx.fillText(line, CONTENT_X, bodyTop + BODY + index * BODY_LINE))
  }

  if (media) {
    ctx.save()
    roundedPath(ctx, CONTENT_X, mediaTop, CONTENT_W, mediaHeight, MEDIA_RADIUS)
    ctx.clip()
    drawCover(ctx, media, CONTENT_X, mediaTop, CONTENT_W, mediaHeight)
    ctx.restore()
  }

  // The actions, spread across the content: reply, repost, like, views with the count, and bookmark.
  const [reply, repost, like, viewsIcon, bookmark] = icons
  const parts = [ACTION, ACTION, ACTION, ACTION + 10 + viewsWidth, ACTION]
  const gap = (CONTENT_W - parts.reduce((sum, width) => sum + width, 0)) / (parts.length - 1)
  let x = CONTENT_X
  for (const [index, icon] of [reply, repost, like, viewsIcon, bookmark].entries()) {
    if (icon) ctx.drawImage(icon.source, x, actionsTop, ACTION, ACTION)
    if (index === 3) {
      ctx.fillStyle = muted
      ctx.font = face(400, ACTION_COUNT)
      ctx.fillText(views, x + ACTION + 10, actionsTop + ACTION / 2 + ACTION_COUNT * 0.36)
    }
    x += parts[index] + gap
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
      const { videoWidth: width, videoHeight: height } = video
      if (!width || !height) return finish(null)
      // Copy the frame now: finish() resets the video element, which would drop it.
      const copy = document.createElement("canvas")
      copy.width = width
      copy.height = height
      const copyCtx = copy.getContext("2d")
      if (!copyCtx) return finish(null)
      copyCtx.drawImage(video, 0, 0, width, height)
      finish({ source: copy, width, height })
    }
    video.onerror = () => {
      window.clearTimeout(timer)
      finish(null)
    }
    video.src = src
  })
}

// The Rhenko mark, in the colour of the page's ink. It is read from the site's own file, so the picture carries the real logo.
async function loadMark(ink: string): Promise<Frame | null> {
  try {
    const text = await (await fetch("/gutter-mark.svg")).text()
    const sized = text.replace("<svg ", `<svg width="512" height="457" `).replace(/fill="#000"/g, `fill="${ink}"`)
    return await loadPicture(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`)
  } catch {
    return null
  }
}

// The action icons, drawn in the page's muted colour from the same icon set the post's own buttons use.
async function loadIcons(color: string): Promise<(Frame | null)[]> {
  const { renderToStaticMarkup } = await import("react-dom/server")
  const icons: LucideIcon[] = [MessageCircle, Repeat2, Heart, ChartNoAxesColumn, Bookmark]
  return Promise.all(
    icons.map((icon) => {
      const svg = renderToStaticMarkup(createElement(icon, { size: ACTION, strokeWidth: 1.8, color }))
      return loadPicture(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    })
  )
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
