"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  MAX_STICKER_TEXT,
  ROTATE_LIMIT,
  SIZE_MAX,
  SIZE_MIN,
  clamp,
  emojiFile,
  emojiName,
  tidyText,
  type Placement,
  type Sticker,
  type StickerSet,
  type TextColor,
  type TextFont,
  type TextSticker,
} from "@/lib/stickers"

// The stickers sit on a stage that is the photo's own shape, scaled to cover the box the photo is shown in. The photo is
// cropped the same way (object-cover), so a sticker stays on the same part of the picture whatever the box's shape.
// The stage is sized with container query units of the box around it, which is why the box has a container type.
function stageStyle(aspect: number): CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: `max(100cqw, calc(100cqh * ${aspect}))`,
    height: `max(100cqh, calc(100cqw / ${aspect}))`,
  }
}

function placeStyle(sticker: Sticker): CSSProperties {
  return {
    position: "absolute",
    left: `${sticker.x * 100}%`,
    top: `${sticker.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${sticker.rotate}deg)`,
    width: sticker.kind === "emoji" ? `${sticker.size * 100}%` : undefined,
    fontSize: sticker.kind === "emoji" ? undefined : `${sticker.size * 60}cqw`,
  }
}

const FONT_CLASS: Record<TextFont, string> = { sans: "font-sans", serif: "font-serif", mono: "font-mono" }
const PILL = "block rounded-[0.5em] px-[0.45em] py-[0.2em] leading-tight font-semibold whitespace-nowrap"
// A solid sticker is filled with its colour, and its text is whichever of black or white reads on that fill.
const FILL: Record<TextColor, string> = {
  white: "bg-white text-black",
  black: "bg-black text-white",
  yellow: "bg-yellow-300 text-black",
}
// Outline and plain stickers are text in the colour itself.
const INK: Record<TextColor, string> = {
  white: "text-white",
  black: "text-black",
  yellow: "text-yellow-300",
}

// The edge of an outline sticker is the opposite of its text: white round black text, black round the others.
function outlineEdge(color: TextColor): string {
  const edge = color === "black" ? "#fff" : "#000"
  const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
  return steps.map(([x, y]) => `${x * 0.06}em ${y * 0.06}em 0 ${edge}`).join(", ")
}

function textLook(sticker: Pick<TextSticker, "color" | "background">): { className: string; style: CSSProperties } {
  if (sticker.background === "solid") return { className: cn(PILL, "shadow-md", FILL[sticker.color]), style: {} }
  if (sticker.background === "outline") {
    return { className: cn(PILL, INK[sticker.color]), style: { textShadow: outlineEdge(sticker.color) } }
  }
  return { className: cn(PILL, INK[sticker.color]), style: { textShadow: "0 0.08em 0.3em rgba(0,0,0,0.6)" } }
}

function topicHref(tag: string): string {
  return `/topics/${encodeURIComponent(tag.toLowerCase())}`
}

function StickerBody({ sticker, linkHashtags }: { sticker: Sticker; linkHashtags: boolean }) {
  if (sticker.kind === "emoji") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={emojiFile(sticker.code)}
        alt={emojiName(sticker.code)}
        draggable={false}
        className="block h-auto w-full select-none"
      />
    )
  }
  if (sticker.kind === "hashtag") {
    const label = `#${sticker.tag}`
    const className = cn(PILL, "shadow-md font-sans bg-foreground text-background")
    if (!linkHashtags) return <span className={className}>{label}</span>
    return (
      <Link href={topicHref(sticker.tag)} className={cn(className, "pointer-events-auto hover:underline")}>
        {label}
      </Link>
    )
  }
  const look = textLook(sticker)
  return (
    <span className={cn(look.className, FONT_CLASS[sticker.font])} style={look.style}>
      {sticker.text}
    </span>
  )
}

// Stickers over a photo, for people viewing it. The layer takes no pointer events, so the photo stays clickable underneath.
// The only exception is a hashtag, which is a link to its topic when linkHashtags is set (in the feed and the lightbox).
export function StickerLayer({ set, className, linkHashtags = false }: { set: StickerSet; className?: string; linkHashtags?: boolean }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden [container-type:size]", className)}>
      <div style={stageStyle(set.aspect)} className="[container-type:size]">
        {set.items.map((sticker, index) => (
          <div key={index} style={placeStyle(sticker)}>
            <StickerBody sticker={sticker} linkHashtags={linkHashtags} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function stickerLabel(sticker: Sticker): string {
  if (sticker.kind === "emoji") return `Sticker: ${emojiName(sticker.code)}`
  if (sticker.kind === "hashtag") return `Hashtag sticker: #${sticker.tag}`
  return `Text sticker: ${sticker.text}`
}

// What an edit may change: a placement, and for a text sticker its words and look.
export type StickerPatch = Partial<Placement> & Partial<Pick<TextSticker, "text" | "font" | "color" | "background">>

// A sticker whose centre is this close to the middle line of the photo snaps onto it. The distance is a share of the photo.
const SNAP = 0.015
// Two taps on a text sticker this close together start editing it.
const DOUBLE_TAP_MS = 400

type Point = { x: number; y: number }
type Gesture =
  | { kind: "move"; index: number; pointer: number; dx: number; dy: number }
  | {
      kind: "pinch"
      index: number
      first: number
      second: number
      distance: number
      angle: number
      size: number
      rotate: number
    }

// The distance and the angle from one point to another, in the same units as the points.
function gap(a: Point, b: Point): { distance: number; angle: number } {
  return { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) }
}

// The turn from one angle to another the short way round, in radians.
function turn(from: number, to: number): number {
  const difference = to - from
  return Math.atan2(Math.sin(difference), Math.cos(difference))
}

// The words of a text sticker being edited. It takes the place of the sticker until it is finished: Enter keeps the words,
// Escape drops them, and leaving the field keeps them too.
function TextEditor({
  index,
  sticker,
  onFinish,
}: {
  index: number
  sticker: TextSticker
  onFinish: (text: string | null, keepFocus: boolean) => void
}) {
  const [value, setValue] = useState(sticker.text)
  const field = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    // Focus waits a frame, so the pointer's own focus change does not take it back.
    const frame = requestAnimationFrame(() => {
      field.current?.focus()
      field.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const look = textLook(sticker)
  return (
    <input
      ref={field}
      data-sticker={index}
      value={value}
      maxLength={MAX_STICKER_TEXT}
      aria-label="Sticker text"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (!done.current) onFinish(value, false)
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault()
          done.current = true
          onFinish(event.key === "Enter" ? value : null, true)
        }
      }}
      style={{ ...look.style, fontSize: "inherit", width: `${Math.max(value.length, 4)}ch` }}
      className={cn(look.className, FONT_CLASS[sticker.font], "outline-2 outline-offset-2 outline-solid outline-dusk")}
    />
  )
}

// The stickers of a photo while it is being edited in the composer. A sticker is selected by a tap or a click, and can be
// dragged, pinched, turned, moved and removed. The keyboard does the same without a mouse.
export function StickerEditLayer({
  set,
  selected,
  editing,
  onSelect,
  onEdit,
  onChange,
  onRemove,
  className,
}: {
  set: StickerSet
  selected: number | null
  editing: boolean
  onSelect: (index: number | null) => void
  onEdit: (editing: boolean) => void
  onChange: (index: number, patch: StickerPatch) => void
  onRemove: (index: number) => void
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const bin = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point & { index: number }>())
  const gesture = useRef<Gesture | null>(null)
  const lastTap = useRef<{ index: number; time: number } | null>(null)
  const refocus = useRef(false)
  const [guide, setGuide] = useState({ x: false, y: false })
  const [moving, setMoving] = useState(false)
  const [overBin, setOverBin] = useState(false)

  // After an edit ends from the keyboard, focus goes back to the sticker that was edited.
  useEffect(() => {
    if (editing || !refocus.current) return
    refocus.current = false
    if (selected !== null) container.current?.querySelector<HTMLElement>(`button[data-sticker="${selected}"]`)?.focus()
  }, [editing, selected])

  // The mouse wheel over the selected sticker resizes it, and with Shift it turns it. The page does not scroll meanwhile.
  // The listener is not passive, which is the only way to stop the page scrolling from a wheel handler.
  useEffect(() => {
    const el = container.current
    if (!el) return
    function onWheel(event: WheelEvent) {
      if (selected === null || editing) return
      const sticker = set.items[selected]
      const target = event.target instanceof Element ? event.target.closest(`button[data-sticker="${selected}"]`) : null
      if (!sticker || !target) return
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : 1
      if (event.shiftKey) {
        const delta = (event.deltaY !== 0 ? event.deltaY : event.deltaX) * unit
        onChange(selected, { rotate: clamp(sticker.rotate + delta * 0.25, -ROTATE_LIMIT, ROTATE_LIMIT) })
      } else {
        onChange(selected, { size: clamp(sticker.size * Math.exp((-event.deltaY * unit) * 0.0015), SIZE_MIN, SIZE_MAX) })
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [selected, editing, set, onChange])

  function pointFor(event: { clientX: number; clientY: number }): Point | null {
    const box = stage.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null
    return {
      x: clamp((event.clientX - box.left) / box.width, 0, 1),
      y: clamp((event.clientY - box.top) / box.height, 0, 1),
    }
  }

  function overBinAt(x: number, y: number): boolean {
    const box = bin.current?.getBoundingClientRect()
    if (!box) return false
    return Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2)) <= box.width / 2 + 8
  }

  function finishEdit(index: number, text: string | null, keepFocus: boolean) {
    const sticker = set.items[index]
    const next = text === null ? "" : tidyText(text)
    if (sticker?.kind === "text" && next !== "" && next !== sticker.text) onChange(index, { text: next })
    refocus.current = keepFocus
    onEdit(false)
  }

  function onPointerDown(index: number, sticker: Sticker, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const id = event.pointerId
    event.currentTarget.setPointerCapture(id)
    pointers.current.set(id, { index, x: event.clientX, y: event.clientY })
    onSelect(index)

    // A second pointer on the same sticker is a pinch: the size follows the distance between the two, and the turn follows
    // the angle between them.
    const own = [...pointers.current.entries()].filter(([, point]) => point.index === index)
    if (own.length >= 2) {
      const [[first, a], [second, b]] = own
      const { distance, angle } = gap(a, b)
      gesture.current =
        distance < 1 ? null : { kind: "pinch", index, first, second, distance, angle, size: sticker.size, rotate: sticker.rotate }
      return
    }

    const last = lastTap.current
    lastTap.current = { index, time: event.timeStamp }
    if (sticker.kind === "text" && last?.index === index && event.timeStamp - last.time < DOUBLE_TAP_MS) {
      lastTap.current = null
      gesture.current = null
      onEdit(true)
      return
    }

    // The offset from the pointer to the sticker's centre is kept, so the sticker does not jump under the finger.
    const point = pointFor(event)
    gesture.current = point ? { kind: "move", index, pointer: id, dx: sticker.x - point.x, dy: sticker.y - point.y } : null
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const tracked = pointers.current.get(event.pointerId)
    if (tracked) {
      tracked.x = event.clientX
      tracked.y = event.clientY
    }
    const current = gesture.current
    if (!current) return

    if (current.kind === "move") {
      if (current.pointer !== event.pointerId) return
      const point = pointFor(event)
      if (!point) return
      let x = clamp(point.x + current.dx, 0, 1)
      let y = clamp(point.y + current.dy, 0, 1)
      const snapX = Math.abs(x - 0.5) <= SNAP
      const snapY = Math.abs(y - 0.5) <= SNAP
      if (snapX) x = 0.5
      if (snapY) y = 0.5
      setGuide({ x: snapX, y: snapY })
      setMoving(true)
      setOverBin(overBinAt(event.clientX, event.clientY))
      onChange(current.index, { x, y })
      return
    }

    const a = pointers.current.get(current.first)
    const b = pointers.current.get(current.second)
    if (!a || !b) return
    const { distance, angle } = gap(a, b)
    const size = current.size * (distance / current.distance)
    const rotate = current.rotate + (turn(current.angle, angle) * 180) / Math.PI
    onChange(current.index, {
      size: clamp(size, SIZE_MIN, SIZE_MAX),
      rotate: clamp(rotate, -ROTATE_LIMIT, ROTATE_LIMIT),
    })
  }

  // A pointer lifted or cancelled. A sticker dropped over the bin is removed; a cancelled drag is not.
  function endPointer(event: PointerEvent<HTMLDivElement>, dropped: boolean) {
    const id = event.pointerId
    pointers.current.delete(id)
    const current = gesture.current
    if (!current) return
    const ended = current.kind === "move" ? current.pointer === id : current.first === id || current.second === id
    if (!ended) return
    gesture.current = null
    if (current.kind === "move" && dropped && overBinAt(event.clientX, event.clientY)) onRemove(current.index)
    setMoving(false)
    setOverBin(false)
    setGuide({ x: false, y: false })
  }

  function onKeyDown(index: number, sticker: Sticker, event: KeyboardEvent<HTMLButtonElement>) {
    const count = set.items.length
    const step = event.shiftKey ? 0.05 : 0.01
    let handled = true
    switch (event.key) {
      case "ArrowLeft":
        onChange(index, { x: clamp(sticker.x - step, 0, 1) })
        break
      case "ArrowRight":
        onChange(index, { x: clamp(sticker.x + step, 0, 1) })
        break
      case "ArrowUp":
        onChange(index, { y: clamp(sticker.y - step, 0, 1) })
        break
      case "ArrowDown":
        onChange(index, { y: clamp(sticker.y + step, 0, 1) })
        break
      case "+":
      case "=":
        onChange(index, { size: clamp(sticker.size + 0.02, SIZE_MIN, SIZE_MAX) })
        break
      case "-":
        onChange(index, { size: clamp(sticker.size - 0.02, SIZE_MIN, SIZE_MAX) })
        break
      case "[":
        onChange(index, { rotate: clamp(sticker.rotate - 5, -ROTATE_LIMIT, ROTATE_LIMIT) })
        break
      case "]":
        onChange(index, { rotate: clamp(sticker.rotate + 5, -ROTATE_LIMIT, ROTATE_LIMIT) })
        break
      case "Delete":
      case "Backspace":
        onRemove(index)
        break
      case "Enter":
        if (selected !== index) onSelect(index)
        else if (sticker.kind === "text") onEdit(true)
        break
      case "Escape":
        event.currentTarget.blur()
        onSelect(null)
        break
      case "Tab": {
        // Tab goes from sticker to sticker and wraps round. Escape leaves them.
        if (count < 2) {
          handled = false
          break
        }
        const next = (index + (event.shiftKey ? count - 1 : 1)) % count
        container.current?.querySelector<HTMLElement>(`button[data-sticker="${next}"]`)?.focus()
        break
      }
      default:
        handled = false
    }
    if (handled) event.preventDefault()
  }

  return (
    <div
      ref={container}
      onPointerDown={(event) => {
        if (!(event.target instanceof Element && event.target.closest("[data-sticker]"))) onSelect(null)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endPointer(event, true)}
      onPointerCancel={(event) => endPointer(event, false)}
      className={cn("absolute inset-0 overflow-hidden [container-type:size]", className)}
    >
      <div ref={stage} style={stageStyle(set.aspect)} className="[container-type:size]">
        {set.items.map((sticker, index) => {
          const isSelected = selected === index
          return (
            <div key={index} style={placeStyle(sticker)}>
              {editing && isSelected && sticker.kind === "text" ? (
                <TextEditor
                  index={index}
                  sticker={sticker}
                  onFinish={(text, keepFocus) => finishEdit(index, text, keepFocus)}
                />
              ) : (
                <button
                  type="button"
                  data-sticker={index}
                  aria-label={stickerLabel(sticker)}
                  aria-pressed={isSelected}
                  onPointerDown={(event) => onPointerDown(index, sticker, event)}
                  onKeyDown={(event) => onKeyDown(index, sticker, event)}
                  onFocus={() => onSelect(index)}
                  className={cn(
                    "block touch-none cursor-grab rounded-[0.5em] bg-transparent p-0 select-none active:cursor-grabbing",
                    isSelected
                      ? "outline-1 outline-offset-2 outline-dashed outline-dusk"
                      : "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dusk"
                  )}
                >
                  <StickerBody sticker={sticker} linkHashtags={false} />
                </button>
              )}
            </div>
          )
        })}
        {guide.x ? <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-dusk" /> : null}
        {guide.y ? <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-dusk" /> : null}
      </div>
      {moving ? (
        <div
          ref={bin}
          data-sticker-bin
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-3 left-1/2 grid size-12 -translate-x-1/2 place-items-center rounded-full shadow-md transition-[background-color,transform] duration-200",
            overBin ? "scale-110 bg-destructive text-white" : "glass text-foreground"
          )}
        >
          <Trash2 className="size-5" />
        </div>
      ) : null}
    </div>
  )
}
