"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { editPost } from "@/actions/posts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { MediaItem } from "@/lib/data"
import { MAX_ALT, MAX_POST, countChars } from "@/lib/rules"

export function EditPostDialog({
  open,
  onOpenChange,
  postId,
  body,
  media,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  postId: string
  body: string
  media: MediaItem[]
}) {
  const router = useRouter()
  const [text, setText] = useState(body)
  const [alts, setAlts] = useState<Record<string, string>>(() => Object.fromEntries(media.map((m) => [m.id, m.alt])))
  const [pending, startTransition] = useTransition()
  const remaining = MAX_POST - countChars(text)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData()
    form.set("body", text)
    for (const item of media) form.set(`alt-${item.id}`, alts[item.id] ?? "")
    startTransition(async () => {
      const result = await editPost(postId, form)
      if (result.ok) {
        toast.success("Post updated.")
        onOpenChange(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton>
        <DialogTitle className="text-lg font-semibold">Edit post</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">You can edit a post for 30 minutes after it&apos;s posted.</DialogDescription>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Post text</span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              className="field-sizing-content min-h-24 w-full resize-none rounded-xl border border-border bg-background p-3 text-[15px] leading-relaxed outline-none focus:border-dusk"
            />
            <span className={remaining < 0 ? "text-right text-sm text-destructive" : "text-right text-sm text-muted-foreground tabular-nums"}>{remaining}</span>
          </label>
          {media.map((item, index) => (
            <label key={item.id} className="flex flex-col gap-1 text-[13px]">
              <span className="text-muted-foreground">
                Alt text for {item.kind === "video" ? "video" : `image ${index + 1}`}
              </span>
              <textarea
                value={alts[item.id] ?? ""}
                maxLength={MAX_ALT}
                rows={2}
                onChange={(event) => setAlts((current) => ({ ...current, [item.id]: event.target.value }))}
                className="resize-none rounded-lg border border-border bg-background p-2 text-sm outline-none focus:border-dusk"
              />
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-full px-4">
              Cancel
            </Button>
            <Button type="submit" disabled={pending || remaining < 0 || countChars(text) === 0 && media.length === 0} className="h-9 rounded-full px-5 font-semibold">
              {pending ? "Saving" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
