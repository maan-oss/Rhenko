"use client"

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react"
import { cn } from "@/lib/utils"
import { clamp, emojiFile, emojiName, type Placement, type Sticker, type StickerSet } from "@/lib/stickers"

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

function placeStyle(sticker: Placement, kind: Sticker["kind"]): CSSProperties {
  return {
    position: "absolute",
    left: `${sticker.x * 100}%`,
    top: `${sticker.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${sticker.rotate}deg)`,
    width: kind === "emoji" ? `${sticker.size * 100}%` : undefined,
    fontSize: kind === "text" ? `${sticker.size * 60}cqw` : undefined,
  }
}

const TEXT_STYLE = {
  light: "bg-white text-black",
  dark: "bg-black text-white",
  dusk: "bg-dusk text-white",
} as const

function StickerBody({ sticker }: { sticker: Sticker }) {
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
  return (
    <span
      className={cn(
        "block rounded-[0.5em] px-[0.45em] py-[0.2em] leading-tight font-semibold whitespace-nowrap shadow-md",
        TEXT_STYLE[sticker.style]
      )}
    >
      {sticker.text}
    </span>
  )
}

// Stickers over a photo, for people viewing it. It takes no pointer events, so the photo stays clickable underneath.
export function StickerLayer({ set, className }: { set: StickerSet; className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden [container-type:size]", className)}>
      <div style={stageStyle(set.aspect)} className="[container-type:size]">
        {set.items.map((sticker, index) => (
          <div key={index} style={placeStyle(sticker, sticker.kind)}>
            <StickerBody sticker={sticker} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function stickerLabel(sticker: Sticker): string {
  return sticker.kind === "emoji" ? `Sticker: ${emojiName(sticker.code)}` : `Text sticker: ${sticker.text}`
}

// The stickers of a photo while it is being edited in the composer. Each one can be dragged, or moved, resized and turned
// from the keyboard, so the controls work without a mouse.
export function StickerEditLayer({
  set,
  selected,
  onSelect,
  onChange,
  onRemove,
  className,
}: {
  set: StickerSet
  selected: number | null
  onSelect: (index: number) => void
  onChange: (index: number, patch: Partial<Placement>) => void
  onRemove: (index: number) => void
  className?: string
}) {
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; pointer: number } | null>(null)

  function pointFor(event: PointerEvent<HTMLElement>): { x: number; y: number } | null {
    const box = stage.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null
    return {
      x: clamp((event.clientX - box.left) / box.width, 0, 1),
      y: clamp((event.clientY - box.top) / box.height, 0, 1),
    }
  }

  function onPointerDown(index: number, event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    onSelect(index)
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { index, pointer: event.pointerId }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    const point = pointFor(event)
    if (point) onChange(current.index, point)
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer === event.pointerId) drag.current = null
  }

  function onKeyDown(index: number, sticker: Sticker, event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.05 : 0.01
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
        onChange(index, { size: clamp(sticker.size + 0.02, 0.05, 0.6) })
        break
      case "-":
        onChange(index, { size: clamp(sticker.size - 0.02, 0.05, 0.6) })
        break
      case "[":
        onChange(index, { rotate: clamp(sticker.rotate - 5, -180, 180) })
        break
      case "]":
        onChange(index, { rotate: clamp(sticker.rotate + 5, -180, 180) })
        break
      case "Delete":
      case "Backspace":
        onRemove(index)
        break
      default:
        return
    }
    event.preventDefault()
  }

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn("absolute inset-0 overflow-hidden [container-type:size]", className)}
    >
      <div ref={stage} style={stageStyle(set.aspect)} className="[container-type:size]">
        {set.items.map((sticker, index) => {
          const isSelected = selected === index
          return (
            <div key={index} style={placeStyle(sticker, sticker.kind)}>
              <button
                type="button"
                aria-label={stickerLabel(sticker)}
                aria-pressed={isSelected}
                onPointerDown={(event) => onPointerDown(index, event)}
                onKeyDown={(event) => onKeyDown(index, sticker, event)}
                onFocus={() => onSelect(index)}
                className={cn(
                  "block touch-none cursor-grab rounded-[0.5em] bg-transparent p-0 select-none active:cursor-grabbing",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dusk",
                  isSelected && "outline-2 outline-offset-2 outline-dusk outline-solid"
                )}
              >
                <StickerBody sticker={sticker} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
