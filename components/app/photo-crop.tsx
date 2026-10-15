"use client"

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { MAX_IMAGE_BYTES } from "@/lib/rules"
import { cn } from "@/lib/utils"

// A picture cut down to the part the person framed. Coordinates are in the picture's own pixels.
export type Crop = { x: number; y: number; width: number; height: number }

// The longest side a saved picture keeps. Anything larger is scaled down, which also brings a large phone photo under the
// upload limit.
const MAX_SIDE = 2560
const MIN_ZOOM = 1
const MAX_ZOOM = 4
// The frame on screen is this wide. Its height follows the shape being framed.
const FRAME_WIDTH = 360

function loadPicture(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ image, url })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("That picture could not be read."))
    }
    image.src = url
  })
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("That picture could not be saved."))), "image/jpeg", quality)
  })
}

// Cuts the framed part out of a picture and encodes it as a JPEG. If it is still over the upload limit, it is made smaller
// and encoded again, so any photo a phone takes can be sent.
export async function renderCrop(file: File, crop: Crop, name: string): Promise<File> {
  const { image, url } = await loadPicture(file)
  URL.revokeObjectURL(url)
  let side = Math.min(MAX_SIDE, Math.max(crop.width, crop.height))
  let quality = 0.92
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const scale = Math.min(1, side / Math.max(crop.width, crop.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(crop.width * scale))
    canvas.height = Math.max(1, Math.round(crop.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("That picture could not be saved.")
    // JPEG has no transparency, so a transparent corner becomes white rather than black.
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height)
    const blob = await encode(canvas, quality)
    if (blob.size <= MAX_IMAGE_BYTES) return new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
    quality = Math.max(0.6, quality - 0.08)
    side = Math.round(side * 0.82)
  }
  throw new Error("That picture is too detailed to send. Try a smaller crop.")
}

// A whole picture made small enough to send, without framing it. Used where there is no room for a dialog.
export async function shrinkPhoto(file: File): Promise<File> {
  const { image, url } = await loadPicture(file)
  const width = image.naturalWidth
  const height = image.naturalHeight
  URL.revokeObjectURL(url)
  return renderCrop(file, { x: 0, y: 0, width, height }, file.name)
}

export type Ratio = { label: string; value: number | null }

// A dialog that frames a picture. Drag to move it, use the slider to zoom, and pick a shape. Applying it hands back the
// framed part as a new file. `aspect` is width over height; null keeps the picture's own shape.
export function PhotoCrop({
  file,
  title,
  aspect: fixedAspect,
  ratios,
  busyLabel = "Saving…",
  onCancel,
  onApply,
}: {
  file: File
  title: string
  aspect: number | null
  ratios?: Ratio[]
  busyLabel?: string
  onCancel: () => void
  onApply: (picture: File) => void
}) {
  const [picture, setPicture] = useState<{ image: HTMLImageElement; url: string } | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [ratio, setRatio] = useState<number | null>(fixedAspect)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  // The centre of the frame, in the picture's pixels.
  const [center, setCenter] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let alive = true
    let url: string | null = null
    loadPicture(file)
      .then((loaded) => {
        if (!alive) return URL.revokeObjectURL(loaded.url)
        url = loaded.url
        setPicture(loaded)
        setCenter({ x: loaded.image.naturalWidth / 2, y: loaded.image.naturalHeight / 2 })
      })
      .catch((error: unknown) => {
        if (alive) setFailed(error instanceof Error ? error.message : "That picture could not be read.")
      })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  if (!picture) {
    return (
      <Dialog open onOpenChange={(open) => !open && onCancel()}>
        <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{failed ?? "Opening the picture…"}</DialogDescription>
        </DialogContent>
      </Dialog>
    )
  }

  const nw = picture.image.naturalWidth
  const nh = picture.image.naturalHeight
  const shape = ratio ?? nw / nh
  const frameHeight = FRAME_WIDTH / shape
  // The smallest scale at which the picture still covers the frame, then the zoom on top of it.
  const cover = Math.max(FRAME_WIDTH / nw, frameHeight / nh)
  const scale = cover * zoom
  // The part of the picture the frame shows, in its own pixels.
  const visibleW = FRAME_WIDTH / scale
  const visibleH = frameHeight / scale
  const clampedX = Math.min(Math.max(center.x, visibleW / 2), nw - visibleW / 2)
  const clampedY = Math.min(Math.max(center.y, visibleH / 2), nh - visibleH / 2)

  function move(x: number, y: number) {
    setCenter({ x, y })
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const last = drag.current
    if (!last) return
    drag.current = { x: event.clientX, y: event.clientY }
    // Dragging the picture right shows what was on its left, so the centre moves the other way.
    move(clampedX - (event.clientX - last.x) / scale, clampedY - (event.clientY - last.y) / scale)
  }

  function endDrag() {
    drag.current = null
  }

  function changeZoom(next: number) {
    setZoom(next)
  }

  async function apply() {
    setBusy(true)
    setFailed(null)
    try {
      const crop: Crop = { x: clampedX - visibleW / 2, y: clampedY - visibleH / 2, width: visibleW, height: visibleH }
      const framed = await renderCrop(file, crop, file.name)
      onApply(framed)
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "That picture could not be saved.")
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
        <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
        <DialogDescription className="sr-only">Move the picture and zoom to choose the part to keep.</DialogDescription>

        <div className="flex flex-col gap-4">
          <div
            role="img"
            aria-label="The part of the picture that will be kept. Drag to move it."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative mx-auto touch-none cursor-grab overflow-hidden rounded-2xl bg-muted ring-1 ring-border select-none active:cursor-grabbing"
            style={{ width: FRAME_WIDTH, height: frameHeight, maxWidth: "100%" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={picture.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: nw * scale,
                height: nh * scale,
                left: FRAME_WIDTH / 2 - clampedX * scale,
                top: frameHeight / 2 - clampedY * scale,
              }}
            />
          </div>

          <label className="flex flex-col gap-2 text-sm font-semibold">
            <span className="flex items-center justify-between">
              Zoom
              <span className="text-muted-foreground tabular-nums">{Math.round(zoom * 100)}%</span>
            </span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => changeZoom(Number(event.target.value))}
              className="w-full accent-foreground"
            />
          </label>

          {ratios && ratios.length > 1 ? (
            <div role="radiogroup" aria-label="Shape" className="flex flex-wrap gap-2">
              {ratios.map((option) => {
                const selected = option.value === ratio
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRatio(option.value)}
                    className={cn(
                      "h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors duration-200",
                      selected ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-foreground/5"
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          ) : null}

          {failed ? (
            <p role="alert" className="text-[13px] text-destructive">
              {failed}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onCancel} className="h-10 rounded-full px-4">
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={apply} className="h-10 rounded-full px-5">
              {busy ? busyLabel : "Use this"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
