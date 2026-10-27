"use client"

import { useTransition } from "react"
import { Copy, Link2 } from "lucide-react"
import { toast } from "sonner"
import { createInviteLink, removeInviteLink, resetInviteLink } from "@/actions/messages"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { joinPath } from "@/lib/invite-links"
import { MAX_GROUP_MEMBERS } from "@/lib/rules"

const INPUT =
  "h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px] text-muted-foreground outline-none focus-visible:border-foreground/50"

// The invite link part of Group info. Anyone who has joined the group can make the link, copy it, reset it (the old link
// stops working) or turn it off. Someone only invited sees why they can't yet. `ready` is false until the panel has heard
// from the server, so a link the group already has doesn't flash in after a Create button.
export function GroupInviteLink({
  conversationId,
  token,
  ready,
  invited,
  full,
  onChange,
}: {
  conversationId: string
  token: string | null
  ready: boolean
  invited: boolean
  full: boolean
  onChange: (token: string | null) => void
}) {
  const [pending, startTransition] = useTransition()
  // The panel only opens in the browser, where the site's own address is known.
  const url = token && typeof window !== "undefined" ? `${window.location.origin}${joinPath(token)}` : ""

  function create() {
    startTransition(async () => {
      const result = await createInviteLink(conversationId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onChange(result.token)
      toast.success("Invite link made. Copy it to share it.")
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success("Invite link copied.")
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Invite link</p>
      {invited ? (
        <p className="text-sm text-muted-foreground">Accept the invite to share a link to this group.</p>
      ) : !ready ? (
        <Skeleton className="h-10 w-full rounded-xl" />
      ) : token ? (
        <>
          <div className="flex gap-2">
            <label htmlFor="invite-link" className="sr-only">
              Invite link
            </label>
            <input id="invite-link" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className={INPUT} />
            <Button type="button" variant="outline" onClick={copy} className="h-10 rounded-lg px-4">
              <Copy className="size-4" aria-hidden="true" />
              Copy
            </Button>
          </div>
          <div className="flex gap-2">
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" className="h-10 flex-1 rounded-lg">
                  Reset link
                </Button>
              }
              title="Reset the invite link?"
              description="The link you have now stops working. Share the new one with anyone you still want to join."
              confirmLabel="Reset link"
              action={async () => {
                const result = await resetInviteLink(conversationId)
                if (result.ok) onChange(result.token)
                return result
              }}
              onDone={() => toast.success("Invite link reset. The old one no longer works.")}
            />
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" className="h-10 flex-1 rounded-lg text-destructive">
                  Turn off link
                </Button>
              }
              title="Turn off the invite link?"
              description="Nobody can join with it after this. Anyone in the group can make a new link later."
              confirmLabel="Turn off"
              action={async () => {
                const result = await removeInviteLink(conversationId)
                if (result.ok) onChange(null)
                return result
              }}
              onDone={() => toast.success("Invite link turned off.")}
            />
          </div>
        </>
      ) : (
        <Button type="button" variant="outline" disabled={pending} aria-busy={pending} onClick={create} className="h-10 w-full rounded-lg">
          <Link2 className="size-4" aria-hidden="true" />
          {pending ? "Making the link" : "Create invite link"}
        </Button>
      )}
      {invited ? null : (
        <p className="text-xs text-muted-foreground">
          {full
            ? `This group has ${MAX_GROUP_MEMBERS} people, the most it can hold, so nobody can join with a link until someone leaves.`
            : `Anyone with the link can join straight away, with no approval, up to ${MAX_GROUP_MEMBERS} people. They see the group's messages. Reset the link to stop an old one working.`}
        </p>
      )}
    </div>
  )
}
