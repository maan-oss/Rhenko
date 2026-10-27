"use client"

import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { MediaItem } from "@/lib/data"
import { StickerLayer } from "@/components/app/sticker-layer"
import { VideoPlayer } from "@/components/app/video-player"
import { cn } from "@/lib/utils"

function AltBadge({ alt, position = "bottom" }: { alt: string; position?: "top" | "bottom" }) {
  if (!alt) return null
  return (
    <span
      className={cn(
        "absolute left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white",
        position === "top" ? "top-2" : "bottom-2"
      )}
      title={alt}
    >
      ALT
    </span>
  )
}

function Tile({
  item,
  className,
  onOpen,
}: {
  item: MediaItem
  className?: string
  onOpen: (item: MediaItem) => void
}) {
  if (item.kind === "video") {
    return (
      <div className={cn("relative z-10 overflow-hidden rounded-2xl border border-border bg-black", className)}>
        <VideoPlayer src={`/media/${item.file}`} label={item.alt || "Video"} maxHeight="480px">
          <AltBadge alt={item.alt} position="top" />
        </VideoPlayer>
      </div>
    )
  }
  // The photo opens the lightbox from its button. The stickers sit over the button, not inside it, so a hashtag sticker can be
  // a link of its own: only that link takes pointer events, and the rest of the photo still opens the lightbox.
  return (
    <div className={cn("relative z-10 overflow-hidden rounded-2xl border border-border bg-muted", className)}>
      <button
        type="button"
        data-media-open=""
        onClick={() => onOpen(item)}
        aria-label={item.alt ? `Open image: ${item.alt}` : "Open image"}
        className="block size-full overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/media/${item.file}?w=1280`} alt={item.alt} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 hover:scale-[1.01]" />
      </button>
      {item.stickers ? <StickerLayer set={item.stickers} linkHashtags /> : null}
      <AltBadge alt={item.alt} />
    </div>
  )
}

const ARROW =
  "absolute top-1/2 z-20 grid size-10 -translate-y-1/2 sm:size-9 place-items-center rounded-full bg-background text-foreground shadow-md ring-1 ring-border transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:hidden"

// Two or more items sit side by side, one per view. Hover the post to bring up the arrows,
// use the arrow keys once the carousel has focus, swipe on a phone, or pick a dot.
function Carousel({ media, onOpen }: { media: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = media.length
  const canPrev = index > 0
  const canNext = index < count - 1

  function onScroll() {
    const el = track.current
    if (!el || el.clientWidth === 0) return
    setIndex(Math.round(el.scrollLeft / el.clientWidth))
  }

  function go(to: number) {
    const el = track.current
    if (!el) return
    el.scrollTo({ left: Math.min(Math.max(to, 0), count - 1) * el.clientWidth, behavior: "smooth" })
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" && canPrev) {
      event.preventDefault()
      go(index - 1)
    } else if (event.key === "ArrowRight" && canNext) {
      event.preventDefault()
      go(index + 1)
    }
  }

  return (
    <div className="relative">
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={`Media, ${count} items`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="group/media relative overflow-hidden rounded-2xl border border-border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          ref={track}
          onScroll={onScroll}
          className="flex aspect-[4/3] max-h-[520px] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {media.map((item, i) => (
            <div key={item.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}`} className="relative h-full w-full shrink-0 snap-start">
              <Tile item={item} onOpen={onOpen} className="size-full rounded-none border-0" />
            </div>
          ))}
        </div>

        <span aria-hidden="true" className="pointer-events-none absolute top-2.5 right-2.5 z-20 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
          {index + 1} / {count}
        </span>

        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={!canPrev}
          aria-label="Previous photo"
          className={cn(
            ARROW,
            "left-3",
            canPrev
              ? "-translate-x-1 opacity-0 group-hover/media:translate-x-0 group-hover/media:opacity-100 group-focus-within/media:translate-x-0 group-focus-within/media:opacity-100 focus-visible:opacity-100"
              : "pointer-events-none opacity-0"
          )}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={!canNext}
          aria-label="Next photo"
          className={cn(
            ARROW,
            "right-3",
            canNext
              ? "translate-x-1 opacity-0 group-hover/media:translate-x-0 group-hover/media:opacity-100 group-focus-within/media:translate-x-0 group-focus-within/media:opacity-100 focus-visible:opacity-100"
              : "pointer-events-none opacity-0"
          )}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1 flex justify-center">
        {media.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show media ${i + 1} of ${count}`}
            aria-current={i === index ? "true" : undefined}
            className="group grid place-items-center p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          >
            <span
              className={cn(
                "block h-1.5 rounded-full transition-[width,background-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                i === index ? "w-5 bg-foreground" : "w-1.5 bg-foreground/30 group-hover:bg-foreground/60"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export function MediaGrid({ media, sensitive = false }: { media: MediaItem[]; sensitive?: boolean }) {
  const [revealed, setRevealed] = useState(!sensitive)
  const [open, setOpen] = useState<MediaItem | null>(null)
  const openIndex = open ? media.findIndex((item) => item.id === open.id) : -1
  // With the lightbox open, the arrow keys step through the photos of the post.
  useEffect(() => {
    if (!open) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowLeft" && openIndex > 0) setOpen(media[openIndex - 1])
      else if (event.key === "ArrowRight" && openIndex < media.length - 1) setOpen(media[openIndex + 1])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, openIndex, media])
  if (media.length === 0) return null

  const single = media.length === 1
  const frame = media[0]?.kind === "video" ? "aspect-video" : "max-h-[420px] min-h-40"

  return (
    <div className="relative z-10 mt-2">
      {single ? (
        <div className={cn("grid", frame)}>
          <Tile item={media[0]} onOpen={setOpen} className="size-full" />
        </div>
      ) : (
        <Carousel media={media} onOpen={setOpen} />
      )}

      {!revealed ? (
        <div className="absolute inset-0 z-30 grid place-items-center overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl">
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <p className="font-semibold">Sensitive content</p>
            <p className="text-sm text-muted-foreground">This media may be upsetting to some people.</p>
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-1 h-10 rounded-full bg-foreground sm:h-9  px-5 text-sm font-semibold text-background transition-opacity hover:opacity-85"
            >
              View media
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent
          className="mx-auto w-fit max-w-[min(92vw,960px)] gap-3 rounded-none border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[min(92vw,960px)] left-0 right-0 translate-x-0 max-sm:top-1/2 max-sm:bottom-auto max-sm:left-0 max-sm:right-0 max-sm:max-w-[min(92vw,960px)] max-sm:translate-x-0 max-sm:translate-y-[-50%] max-sm:rounded-none max-sm:pt-0 max-sm:pb-0 max-sm:before:hidden"
          showCloseButton
        >
          <DialogTitle className="sr-only">{media.length > 1 && openIndex >= 0 ? `Image ${openIndex + 1} of ${media.length}` : "Image"}</DialogTitle>
          {open ? (
            // The box is the size of the photo itself, so the stickers line up with it exactly.
            <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/${open.file}`} alt={open.alt} className="block h-auto max-h-[78dvh] max-w-full" />
              {open.stickers ? <StickerLayer set={open.stickers} linkHashtags /> : null}
            {media.length > 1 && openIndex > 0 ? (
              <button
                type="button"
                onClick={() => setOpen(media[openIndex - 1])}
                aria-label="Previous photo"
                className="absolute top-1/2 left-2 z-30 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow-md ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            {media.length > 1 && openIndex >= 0 && openIndex < media.length - 1 ? (
              <button
                type="button"
                onClick={() => setOpen(media[openIndex + 1])}
                aria-label="Next photo"
                className="absolute top-1/2 right-2 z-30 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-background text-foreground shadow-md ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            {media.length > 1 && openIndex >= 0 ? (
              <p className="absolute top-2 left-2 z-30 rounded-full bg-background/90 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">
                {openIndex + 1} / {media.length}
              </p>
            ) : null}
            </div>
          ) : null}
          {open?.alt ? <p className="w-0 min-w-full rounded-lg bg-background/90 px-3 py-2 text-sm break-words text-foreground">{open.alt}</p> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
