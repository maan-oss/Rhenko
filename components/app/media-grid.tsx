"use client"

import { useState } from "react"
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

export function MediaGrid({ media, sensitive = false }: { media: MediaItem[]; sensitive?: boolean }) {
  const [revealed, setRevealed] = useState(!sensitive)
  const [open, setOpen] = useState<MediaItem | null>(null)
  if (media.length === 0) return null

  const count = media.length
  const frame =
    count === 1
      ? media[0].kind === "video"
        ? "aspect-video"
        : "max-h-[420px] min-h-40"
      : count === 2
        ? "aspect-[7/4] gap-0.5"
        : "aspect-[4/3] gap-0.5"

  return (
    <div className={cn("relative z-10 mt-2 grid gap-1", count > 1 ? "grid-cols-2" : "grid-cols-1", frame)}>
      {count === 1 ? (
        <Tile item={media[0]} onOpen={setOpen} className="size-full" />
      ) : count === 3 ? (
        <>
          <Tile item={media[0]} onOpen={setOpen} className="row-span-2 size-full" />
          <Tile item={media[1]} onOpen={setOpen} className="size-full" />
          <Tile item={media[2]} onOpen={setOpen} className="size-full" />
        </>
      ) : (
        media.map((item) => <Tile key={item.id} item={item} onOpen={setOpen} className="size-full" />)
      )}

      {!revealed ? (
        <div className="absolute inset-0 z-20 grid place-items-center overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl">
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
