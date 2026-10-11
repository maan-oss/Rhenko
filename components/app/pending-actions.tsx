"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { deletePost, publishNow } from "@/actions/posts"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"

// Publish a draft or scheduled post now, or delete it.
export function PendingActions({ postId, mode }: { postId: string; mode: "draft" | "scheduled" }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-1 pb-3 pl-16">
      <Button
        type="button"
        disabled={pending}
        className="h-8 rounded-full px-4 font-semibold"
        onClick={() =>
          startTransition(async () => {
            const result = await publishNow(postId)
            if (!result.ok) toast.error(result.error)
            else {
              toast.success(mode === "draft" ? "Draft published." : "Published now.")
              router.refresh()
            }
          })
        }
      >
        Publish now
      </Button>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="outline" className="h-8 rounded-full px-4 text-destructive">
            Delete
          </Button>
        }
        title={mode === "draft" ? "Delete this draft?" : "Delete this scheduled post?"}
        description="It's gone for good. This can't be undone."
        confirmLabel="Delete"
        action={() => deletePost(postId)}
        onDone={() => router.refresh()}
      />
    </div>
  )
}
