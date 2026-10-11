"use client"

import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { MediaItem } from "@/lib/data"
import { cn } from "@/lib/utils"

function AltBadge({ alt }: { alt: string }) {
  if (!alt) return null
  return (
    <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white" title={alt}>
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
        <video
          src={`/media/${item.file}`}
          controls
          preload="metadata"
          playsInline
          aria-label={item.alt || "Video"}
          className="size-full max-h-[480px] object-contain"
        />
        <AltBadge alt={item.alt} />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={item.alt ? `Open image: ${item.alt}` : "Open image"}
      className={cn("relative z-10 block overflow-hidden rounded-2xl border border-border bg-muted", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/media/${item.file}`} alt={item.alt} loading="lazy" className="size-full object-cover transition-transform duration-300 hover:scale-[1.01]" />
      <AltBadge alt={item.alt} />
    </button>
  )
}

// Two or more items scroll sideways, one per view, and snap to each. Swipe on a phone, scroll or use the arrows elsewhere.
function Carousel({ media, onOpen }: { media: MediaItem[]; onOpen: (item: MediaItem) => void }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const count = media.length

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

  const arrow = "absolute top-1/2 z-20 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground ring-1 ring-border transition-opacity duration-200 disabled:opacity-0"

  return (
    <div className="group relative">
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label={`Media, ${count} items`}
        className="relative overflow-hidden rounded-2xl border border-border bg-muted"
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
        <span aria-hidden="true" className="pointer-events-none absolute top-2 right-2 z-20 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
          {index + 1} / {count}
        </span>
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Previous media"
          className={cn(arrow, "left-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:hidden")}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === count - 1}
          aria-label="Next media"
          className={cn(arrow, "right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:hidden")}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {media.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => go(i)}
            aria-label={`Show media ${i + 1} of ${count}`}
            aria-current={i === index ? "true" : undefined}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color] duration-200",
              i === index ? "w-4 bg-foreground" : "w-1.5 bg-foreground/30 hover:bg-foreground/60"
            )}
          />
        ))}
      </div>
    </div>
  )
}

export function MediaGrid({ media, sensitive = false }: { media: MediaItem[]; sensitive?: boolean }) {
  const [revealed, setRevealed] = useState(!sensitive)
  const [open, setOpen] = useState<MediaItem | null>(null)
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
              className="mt-1 h-9 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-85"
            >
              View media
            </button>
          </div>
        </div>
      ) : null}

      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="max-w-[min(92vw,960px)] border-0 bg-transparent p-0 shadow-none ring-0 sm:max-w-[min(92vw,960px)]" showCloseButton>
          <DialogTitle className="sr-only">Image</DialogTitle>
          {open ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/media/${open.file}`} alt={open.alt} className="max-h-[85dvh] w-full rounded-xl object-contain" />
          ) : null}
          {open?.alt ? <p className="rounded-lg bg-background/90 px-3 py-2 text-sm text-foreground">{open.alt}</p> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
