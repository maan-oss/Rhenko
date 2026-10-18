"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { editPost } from "@/actions/posts"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { MediaItem } from "@/lib/data"
import { MAX_ALT, MAX_ARTICLE, MAX_POST, MAX_TITLE, cleanTitle, countChars } from "@/lib/rules"
import { cn } from "@/lib/utils"

// Editing a post that is live: its text, and the description of each picture or video. The form is built each time the dialog
// opens, so it always starts from the post as it is now and a cancelled edit leaves nothing behind.
export function EditPostDialog({
  open,
  onOpenChange,
  postId,
  body,
  title,
  media,
  windowMs,
  reply = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string
  body: string
  title: string
  media: MediaItem[]
  windowMs: number
  reply?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
        <DialogTitle className="text-lg font-semibold">Edit post</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          You can edit {reply ? "a reply" : "a post"} for {Math.round(windowMs / 60_000)} minutes after it&apos;s posted.
        </DialogDescription>
        <EditForm postId={postId} body={body} title={title} media={media} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ postId, body, title, media, onDone }: { postId: string; body: string; title: string; media: MediaItem[]; onDone: () => void }) {
  const router = useRouter()
  const [text, setText] = useState(body)
  const [heading, setHeading] = useState(title)
  const [alts, setAlts] = useState<Record<string, string>>(() => Object.fromEntries(media.map((m) => [m.id, m.alt])))
  const [pending, startTransition] = useTransition()
  // An article keeps its title and its longer body limit.
  const article = title !== ""
  const remaining = (article ? MAX_ARTICLE : MAX_POST) - countChars(text)
  const titleReady = !article || (cleanTitle(heading).length > 0 && [...cleanTitle(heading)].length <= MAX_TITLE)
  const empty = countChars(text) === 0 && media.length === 0
  // Saving what is already there would only mark the post as edited, so Save waits for a change.
  const changed =
    text.trim() !== body.trim() || (article && cleanTitle(heading) !== title) || media.some((m) => (alts[m.id] ?? "").trim() !== m.alt.trim())

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || remaining < 0 || empty || !changed || !titleReady) return
    const form = new FormData()
    form.set("body", text)
    if (article) form.set("title", cleanTitle(heading))
    for (const item of media) form.set(`alt-${item.id}`, alts[item.id] ?? "")
    startTransition(async () => {
      const result = await editPost(postId, form)
      if (result.ok) {
        toast.success("Post updated.")
        onDone()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {article ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">Title</span>
          <input
            value={heading}
            onChange={(event) => setHeading(event.target.value)}
            maxLength={MAX_TITLE * 2}
            className="h-10 rounded-full border border-border bg-background px-4 text-[15px] font-semibold outline-none"
          />
        </label>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Post text"
          rows={4}
          className="field-sizing-content max-h-[40dvh] min-h-24 w-full resize-none overflow-y-auto rounded-xl border border-border bg-background p-3 text-[15px] leading-relaxed outline-none"
        />
        <p className={cn("text-right text-sm tabular-nums", remaining < 0 ? "text-destructive" : "text-muted-foreground")}>{remaining}</p>
      </div>
      {media.map((item, index) => (
        <label key={item.id} className="flex flex-col gap-1 text-[13px]">
          <span className="text-muted-foreground">Alt text for {item.kind === "video" ? "video" : `image ${index + 1}`}</span>
          <textarea
            value={alts[item.id] ?? ""}
            maxLength={MAX_ALT}
            rows={2}
            onChange={(event) => setAlts((current) => ({ ...current, [item.id]: event.target.value }))}
            className="resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none"
          />
        </label>
      ))}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone} className="h-10 rounded-full px-4 sm:h-9">
          Cancel
        </Button>
        <Button type="submit" disabled={pending || remaining < 0 || empty || !changed || !titleReady} className="h-10 rounded-full px-5 font-semibold sm:h-9">
          {pending ? "Saving" : "Save"}
        </Button>
      </div>
    </form>
  )
}
