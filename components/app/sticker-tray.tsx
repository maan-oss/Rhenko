"use client"

import { useId, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  EMOJI_STICKERS,
  MAX_HASHTAG,
  MAX_STICKER_TEXT,
  TEXT_LOOKS,
  emojiFile,
  isHashtag,
  tidyTag,
  tidyText,
  type TextLook,
} from "@/lib/stickers"
import { cn } from "@/lib/utils"

export type StickerPick =
  | { kind: "emoji"; code: string }
  | { kind: "text"; text: string; look: TextLook }
  | { kind: "hashtag"; tag: string }

const LOOK_SWATCH: Record<TextLook, string> = {
  light: "bg-white text-black ring-1 ring-border",
  dark: "bg-black text-white",
}
const LOOK_NAME: Record<TextLook, string> = { light: "Light", dark: "Dark" }

// Chooses a sticker to put on a photo: an emoji from the set, a short line of text in one of three looks, or a hashtag. The
// composer places it; this only picks it.
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
  const [look, setLook] = useState<TextLook>("dark")
  const [tagInput, setTagInput] = useState("")
  const hintId = useId()
  const text = tidyText(words)
  const tag = tidyTag(tagInput)
  const tagValid = isHashtag(tag)
  const tagInvalid = tag !== "" && !tagValid

  function pick(next: StickerPick) {
    onPick(next)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,420px)] gap-4 p-5" showCloseButton>
        <DialogTitle className="text-lg font-semibold">Add a sticker</DialogTitle>
        <div
          className="grid max-h-[40dvh] grid-cols-6 gap-1.5 overflow-y-auto sm:grid-cols-7"
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
              className="grid aspect-square place-items-center rounded-xl transition-colors duration-200 hover:bg-muted"
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
            if (text !== "") pick({ kind: "text", text, look })
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
          <div role="group" aria-label="Text sticker look" className="flex gap-2">
            {TEXT_LOOKS.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={look === name}
                onClick={() => setLook(name)}
                className={cn(
                  "h-9 flex-1 rounded-full text-[13px] font-semibold transition-shadow duration-200",
                  LOOK_SWATCH[name],
                  look === name && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                )}
              >
                {LOOK_NAME[name]}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={text === ""} className="h-9 shrink-0 rounded-full px-4">
              Add text
            </Button>
          </div>
        </form>
        <form
          className="flex flex-col gap-3 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (tagValid) pick({ kind: "hashtag", tag })
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Hashtag
            <Input
              value={tagInput}
              maxLength={MAX_HASHTAG + 1}
              placeholder="summer"
              aria-describedby={hintId}
              aria-invalid={tagInvalid}
              onChange={(event) => setTagInput(event.target.value)}
              className="h-10 rounded-lg"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <p id={hintId} className={cn("text-[12px] leading-snug", tagInvalid ? "text-destructive" : "text-muted-foreground")}>
              {tagInvalid
                ? `Use letters, numbers and underscores, up to ${MAX_HASHTAG}.`
                : "Shows as a link to that topic."}
            </p>
            <Button type="submit" disabled={!tagValid} className="h-9 shrink-0 rounded-full px-4">
              Add hashtag
            </Button>
          </div>
        </form>
        <p className="border-t border-border pt-4 text-[12px] leading-snug text-muted-foreground">
          Emoji artwork: Twemoji, copyright Twitter, Inc. and other contributors, under CC-BY 4.0.
        </p>
      </DialogContent>
    </Dialog>
  )
}
