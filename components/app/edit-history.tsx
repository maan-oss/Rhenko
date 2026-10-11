"use client"

import { useState, useTransition } from "react"
import { getEditHistory } from "@/actions/posts"
import { LocalTime } from "@/components/app/time-text"
import { PostBody } from "@/components/app/post-body"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { EditVersion } from "@/lib/data"

// The "Edited" mark on a post. Opening it lists each earlier version with its time.
export function EditHistory({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<EditVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function openHistory(next: boolean) {
    setOpen(next)
    if (!next || versions) return
    startTransition(async () => {
      const result = await getEditHistory(postId)
      if (result.ok) setVersions(result.versions)
      else setError(result.error)
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => openHistory(true)}
        className="relative z-10 text-[13px] text-muted-foreground transition-colors hover:text-dusk hover:underline"
      >
        · Edited
      </button>
      <Dialog open={open} onOpenChange={openHistory}>
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogTitle className="text-base font-semibold">Edit history</DialogTitle>
          <DialogDescription className="sr-only">Every earlier version of this post, newest first</DialogDescription>
          {error ? <p className="text-sm text-muted-foreground">{error}</p> : null}
          {pending && !versions ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
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
