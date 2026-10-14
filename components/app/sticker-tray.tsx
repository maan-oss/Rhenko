"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EMOJI_STICKERS, MAX_STICKER_TEXT, TEXT_STICKER_STYLES, emojiFile, type TextStickerStyle } from "@/lib/stickers"
import { cn } from "@/lib/utils"

export type StickerPick = { kind: "emoji"; code: string } | { kind: "text"; text: string; style: TextStickerStyle }

const STYLE_SWATCH: Record<TextStickerStyle, string> = {
  light: "bg-white text-black ring-1 ring-border",
  dark: "bg-black text-white",
  dusk: "bg-dusk text-white",
}
const STYLE_NAME: Record<TextStickerStyle, string> = { light: "Light", dark: "Dark", dusk: "Dusk" }

// Chooses a sticker to put on a photo: an emoji from the set, or a short line of text in one of three styles. The composer
// places it; this only picks it.
export function StickerTray({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (pick: StickerPick) => void
}) {
  const [words, setWords] = useState("")
  const [style, setStyle] = useState<TextStickerStyle>("dusk")
  const trimmed = words.trim().replace(/\s+/g, " ")

  function pick(next: StickerPick) {
    onPick(next)
    if (next.kind === "text") setWords("")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,420px)] gap-4 p-5" showCloseButton>
        <DialogTitle className="text-lg font-semibold">Add a sticker</DialogTitle>
        <div
          className="grid max-h-[46dvh] grid-cols-6 gap-1.5 overflow-y-auto sm:grid-cols-7"
          role="group"
          aria-label="Emoji stickers"
        >
          {EMOJI_STICKERS.map((sticker) => (
            <button
              key={sticker.code}
              type="button"
              onClick={() => pick({ kind: "emoji", code: sticker.code })}
              aria-label={`Add ${sticker.name}`}
              title={sticker.name}
              className="grid aspect-square place-items-center rounded-xl transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-dusk"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={emojiFile(sticker.code)} alt="" loading="lazy" className="size-9" />
            </button>
          ))}
        </div>
        <form
          className="flex flex-col gap-3 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed !== "") pick({ kind: "text", text: trimmed, style })
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Text sticker
            <Input
              value={words}
              maxLength={MAX_STICKER_TEXT}
              placeholder="Say it in a few words"
              onChange={(event) => setWords(event.target.value)}
              className="h-10 rounded-lg"
            />
          </label>
          <div role="group" aria-label="Text sticker style" className="flex gap-2">
            {TEXT_STICKER_STYLES.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={style === name}
                onClick={() => setStyle(name)}
                className={cn(
                  "h-9 flex-1 rounded-full text-[13px] font-semibold transition-shadow duration-200",
                  STYLE_SWATCH[name],
                  style === name && "ring-2 ring-dusk ring-offset-2 ring-offset-background"
                )}
              >
                {STYLE_NAME[name]}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] leading-snug text-muted-foreground">
              Emoji artwork: Twemoji, copyright Twitter, Inc. and other contributors, under CC-BY 4.0.
            </p>
            <Button type="submit" disabled={trimmed === ""} className="h-9 shrink-0 rounded-full px-4">
              Add text
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
