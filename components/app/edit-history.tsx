"use client"

import { useState, useTransition } from "react"
import { getEditHistory } from "@/actions/posts"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { LocalTime } from "@/components/app/time-text"
import { PostBody } from "@/components/app/post-body"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { EditVersion } from "@/lib/data"
import { cn } from "@/lib/utils"

// The "Edited" mark on a post. Opening it lists each earlier version with its time.
// On a phone the mark's touch area reaches past its text, so it can be pressed without crowding the line it sits on.
export function EditHistory({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<EditVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function load() {
    setError(null)
    startTransition(async () => {
      const result = await getEditHistory(postId)
      if (result.ok) setVersions(result.versions)
      else setError(result.error)
    })
  }

  function openHistory(next: boolean) {
    setOpen(next)
    if (next && !versions) load()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openHistory(true)}
        className="relative z-10 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:underline max-sm:after:absolute max-sm:after:-inset-x-2 max-sm:after:-inset-y-3"
      >
        Edited
      </button>
      <Dialog open={open} onOpenChange={openHistory}>
        <DialogContent className={cn("sm:max-w-lg", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
          <DialogTitle className="text-base font-semibold">Edit history</DialogTitle>
          <DialogDescription className="sr-only">Every earlier version of this post, newest first</DialogDescription>
          {error ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="text-sm text-muted-foreground">
                {error}
              </p>
              <Button type="button" variant="outline" disabled={pending} onClick={load} className="h-10 rounded-full px-4 sm:h-9">
                Try again
              </Button>
            </div>
          ) : null}
          {pending && !versions && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {versions ? (
            <ol className="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto">
              {versions.map((version, index) => (
                <li key={`${version.at}-${index}`} className="py-3">
                  <p className="text-xs text-muted-foreground">
                    <LocalTime at={version.at} variant="full" />
                    {version.current ? " · Current version" : ""}
                  </p>
                  <PostBody text={version.body} className="mt-1 text-[15px]" />
                </li>
              ))}
            </ol>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
