"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { deletePost, publishNow } from "@/actions/posts"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { useProofGate } from "@/components/app/proof-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Publish a draft or scheduled post now, or delete it. These are the two things the server allows for a post that is not
// out yet, so they are the only controls such a post's card has. `afterDelete` is where to go once the post is gone, for
// a card that is the whole page. Without it the list the card is in refreshes.
export function PendingActions({
  postId,
  mode,
  afterDelete,
  className,
}: {
  postId: string
  mode: "draft" | "scheduled"
  afterDelete?: string
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const proof = useProofGate()

  // A draft passes the same account check as a new post. When the server asks for the human check, it opens, and the
  // publish is sent again with the answer.
  function publish(answer?: string) {
    startTransition(async () => {
      const result = await publishNow(postId, answer)
      if (!result.ok) {
        if (result.proofRequired) proof.askForProof((passed) => publish(passed))
        else toast.error(result.error)
        return
      }
      toast.success(mode === "draft" ? "Draft published." : "Published now.")
      router.refresh()
    })
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button type="button" disabled={pending} className="h-10 rounded-full px-4 font-semibold sm:h-8" onClick={() => publish()}>
        {pending ? "Publishing" : "Publish now"}
      </Button>
      {proof.dialog}
      <Button type="button" variant="outline" onClick={() => setDeleteOpen(true)} className="h-10 rounded-full px-4 text-destructive sm:h-8">
        Delete
      </Button>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={mode === "draft" ? "Delete this draft?" : "Delete this scheduled post?"}
        description="It's gone for good. This can't be undone."
        confirmLabel="Delete"
        action={() => deletePost(postId)}
        onDone={() => {
          if (afterDelete) router.push(afterDelete)
          else router.refresh()
        }}
      />
    </div>
  )
}
