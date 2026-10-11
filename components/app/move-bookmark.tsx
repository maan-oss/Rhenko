"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { moveBookmark } from "@/actions/posts"

export function MoveBookmark({
  postId,
  folderId,
  folders,
}: {
  postId: string
  folderId: string | null
  folders: { id: string; name: string }[]
}) {
  const [pending, startTransition] = useTransition()
  return (
    <label className="relative z-10 mt-1 ml-12 flex items-center gap-2 text-[13px] text-muted-foreground">
      <span>Folder</span>
      <select
        value={folderId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value || null
          startTransition(async () => {
            const result = await moveBookmark(postId, next)
            if (!result.ok) toast.error(result.error)
            else toast.success("Bookmark moved.")
          })
        }}
        className="h-8 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground outline-none focus:border-dusk"
      >
        <option value="">Unfiled</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
    </label>
  )
}
