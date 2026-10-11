"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Info } from "lucide-react"
import { toast } from "sonner"
import { addToGroup, leaveConversation, renameGroup } from "@/actions/messages"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MAX_GROUP_TITLE } from "@/lib/rules"

type Member = { id: string; name: string; handle: string; status: "accepted" | "requested" }

const INPUT =
  "h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"

// Rename, add people, or leave a group.
export function GroupPanel({ conversationId, title, members }: { conversationId: string; title: string; members: Member[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const addRef = useRef<HTMLFormElement>(null)
  const [nextTitle, setNextTitle] = useState(title)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon" aria-label="Group info" className="rounded-full" />}>
        <Info className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md" showCloseButton>
        <DialogTitle className="pr-8 text-lg font-semibold">Group info</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">Anyone in the group can see the name and members.</DialogDescription>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            startTransition(async () => {
              const result = await renameGroup(conversationId, nextTitle.trim())
              if (!result.ok) toast.error(result.error)
              else {
                toast.success("Group renamed.")
                router.refresh()
              }
            })
          }}
        >
          <label htmlFor="group-title" className="sr-only">
            Group name
          </label>
          <input id="group-title" value={nextTitle} maxLength={MAX_GROUP_TITLE} onChange={(e) => setNextTitle(e.target.value)} placeholder="Name this group" className={INPUT} />
          <Button type="submit" disabled={pending} className="h-10 rounded-lg px-4">
            Save
          </Button>
        </form>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">Members</p>
          <ul className="flex flex-col divide-y divide-border">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between py-2 text-[15px]">
                <span className="min-w-0 truncate">
                  {member.name} <span className="text-muted-foreground">@{member.handle}</span>
                </span>
                {member.status === "requested" ? <span className="text-sm text-muted-foreground">Invited</span> : null}
              </li>
            ))}
          </ul>
        </div>

        <form
          ref={addRef}
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const handle = String(new FormData(event.currentTarget).get("handle") ?? "").trim()
            startTransition(async () => {
              const result = await addToGroup(conversationId, handle)
              if (!result.ok) toast.error(result.error)
              else {
                addRef.current?.reset()
                toast.success(`Added @${handle.replace(/^@/, "")}.`)
                router.refresh()
              }
            })
          }}
        >
          <label htmlFor="add-handle" className="sr-only">
            Add a person by handle
          </label>
          <input id="add-handle" name="handle" required placeholder="Add by handle" className={INPUT} />
          <Button type="submit" disabled={pending} variant="outline" className="h-10 rounded-lg px-4">
            Add
          </Button>
        </form>

        <div className="pt-2">
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" className="h-10 w-full rounded-lg text-destructive">
                Leave group
              </Button>
            }
            title="Leave this group?"
            description="You won't see new messages from it. Someone in the group can add you back."
            confirmLabel="Leave group"
            action={() => leaveConversation(conversationId)}
            onDone={() => router.push("/messages")}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
