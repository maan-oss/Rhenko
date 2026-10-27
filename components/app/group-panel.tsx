"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Info } from "lucide-react"
import { toast } from "sonner"
import { addToGroup, groupInfo, leaveConversation, removeFromGroup, renameGroup, type GroupMember } from "@/actions/messages"
import { Avatar } from "@/components/app/avatar"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { GroupInviteLink } from "@/components/app/group-invite-link"
import { useProofGate } from "@/components/app/proof-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MAX_GROUP_MEMBERS, MAX_GROUP_TITLE } from "@/lib/rules"

type Member = { id: string; name: string; handle: string; status: "accepted" | "requested"; avatarFile?: string | null }

type Info = { title: string; viewerIsCreator: boolean; members: GroupMember[]; inviteToken: string | null }

const INPUT =
  "h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"

// Rename a group, see who is in it, add people, share its invite link, remove people (only the person who made it), or leave.
// The conversation page hands over the people it already knows. The panel asks the server who made the group each time it
// opens, and again whenever the group changes while it is open, so the creator's controls always match the truth.
export function GroupPanel({ conversationId, title, members }: { conversationId: string; title: string; members: Member[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [info, setInfo] = useState<Info | null>(null)
  const [lost, setLost] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<GroupMember | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const proof = useProofGate()
  const addRef = useRef<HTMLFormElement>(null)

  // Fetch the group's details whenever the panel is open and the group changes.
  const signature = `${title}|${members.map((member) => `${member.id}:${member.status}`).join(",")}`
  useEffect(() => {
    if (!open) return
    let current = true
    void groupInfo(conversationId).then((result) => {
      if (!current) return
      if (result.ok) {
        setInfo({ title: result.title, viewerIsCreator: result.viewerIsCreator, members: result.members, inviteToken: result.inviteToken })
        setLost(null)
      } else {
        setLost(result.error)
      }
    })
    return () => {
      current = false
    }
  }, [open, conversationId, signature])

  async function reload() {
    const result = await groupInfo(conversationId)
    if (result.ok) setInfo({ title: result.title, viewerIsCreator: result.viewerIsCreator, members: result.members, inviteToken: result.inviteToken })
    else setLost(result.error)
  }

  // Until the server answers, the people the page already knows stand in. They carry no creator or avatar details yet.
  const rows: GroupMember[] =
    info?.members ??
    members.map((member) => ({
      id: member.id,
      name: member.name,
      handle: member.handle,
      avatarFile: member.avatarFile ?? null,
      status: member.status,
      isCreator: false,
      isYou: false,
    }))
  const serverTitle = info?.title ?? title
  const shownTitle = draft ?? serverTitle
  const viewerIsCreator = info?.viewerIsCreator ?? false
  const creatorGone = info !== null && !info.members.some((member) => member.isCreator)
  const alone = info !== null && info.members.length <= 1
  // Someone invited to the group can look around, but renaming and adding people wait until they accept.
  const invited = rows.some((member) => member.isYou && member.status === "requested")

  function save() {
    const next = shownTitle.trim()
    startTransition(async () => {
      const result = await renameGroup(conversationId, next)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setDraft(null)
      toast.success(next ? "Group renamed." : "Group name cleared. Its members' names show instead.")
      await reload()
      router.refresh()
    })
  }

  // Inviting someone who doesn't follow you counts as a new conversation, so a busy account may be asked for the human
  // check first. The invitation is then sent again with the answer.
  function add(handle: string, answer?: string) {
    startTransition(async () => {
      const result = await addToGroup(conversationId, handle, answer)
      if (!result.ok) {
        if (result.proofRequired) proof.askForProof((passed) => add(handle, passed))
        else setAddError(result.error)
        return
      }
      setAddError(null)
      addRef.current?.reset()
      const clean = handle.replace(/^@/, "")
      toast.success(result.status === "requested" ? `Invited @${clean}. They join once they accept.` : `Added @${clean} to the group.`)
      await reload()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon" aria-label="Group info" className="rounded-full" />}>
        <Info className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md" showCloseButton>
        <DialogTitle className="pr-8 text-lg font-semibold">Group info</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">Anyone in the group can see the name and the members.</DialogDescription>

        {lost ? (
          <p role="alert" className="rounded-xl bg-muted px-3 py-2 text-sm">
            {lost} Close this and go back to your messages.
          </p>
        ) : invited ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm">You&apos;re invited to this group. Accept the invite to rename it or add people.</p>
        ) : null}

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <label htmlFor="group-title" className="sr-only">
            Group name
          </label>
          <input
            id="group-title"
            value={shownTitle}
            maxLength={MAX_GROUP_TITLE}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Name this group"
            disabled={invited}
            className={INPUT}
          />
          <Button type="submit" disabled={pending || invited || shownTitle.trim() === serverTitle} className="h-10 rounded-lg px-4">
            Save
          </Button>
        </form>

        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            Members <span className="font-normal text-muted-foreground">· {rows.length}</span>
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-2">
                <Avatar user={member} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                    <span className="truncate">{member.name}</span>
                    {member.isCreator ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">Creator</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    @{member.handle}
                    {member.isYou ? " · You" : ""}
                    {member.status === "requested" ? " · Invited" : ""}
                  </p>
                </div>
                {viewerIsCreator && !member.isYou ? (
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Remove @${member.handle} from the group`}
                    onClick={() => {
                      setRemoveTarget(member)
                      setRemoveOpen(true)
                    }}
                    className="h-8 rounded-full px-3 text-destructive"
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {info ? (
            <p className="pt-1 text-xs text-muted-foreground">
              {viewerIsCreator
                ? "You made this group, so you can remove people from it."
                : creatorGone
                  ? "The person who made this group has left, so nobody can remove people from it."
                  : "Only the person who made this group can remove people from it."}{" "}
              Anyone in it can add people, rename it or leave.
            </p>
          ) : null}
        </div>

        <form
          ref={addRef}
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const handle = String(new FormData(event.currentTarget).get("handle") ?? "").trim()
            if (handle) add(handle)
          }}
        >
          <div className="flex gap-2">
            <label htmlFor="add-handle" className="sr-only">
              Add a person by handle
            </label>
            <input id="add-handle" name="handle" required placeholder="Add by handle" autoComplete="off" disabled={invited} className={INPUT} />
            <Button type="submit" disabled={pending || invited} variant="outline" className="h-10 rounded-lg px-4">
              Add
            </Button>
          </div>
          {addError ? (
            <p role="alert" className="text-sm text-destructive">
              {addError}
            </p>
          ) : null}
        </form>

        <GroupInviteLink
          conversationId={conversationId}
          token={info?.inviteToken ?? null}
          ready={info !== null}
          invited={invited}
          full={rows.length >= MAX_GROUP_MEMBERS}
          onChange={(inviteToken) => setInfo((current) => (current ? { ...current, inviteToken } : current))}
        />

        <div className="pt-2">
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" className="h-10 w-full rounded-lg text-destructive">
                Leave group
              </Button>
            }
            title="Leave this group?"
            description={
              alone
                ? "You're the only one left, so leaving deletes the group and its messages."
                : viewerIsCreator
                  ? "You made this group. Once you leave, nobody can remove people from it. You won't get its messages, and someone in the group can add you back."
                  : "You won't get its messages any more. Someone in the group can add you back."
            }
            confirmLabel="Leave group"
            action={() => leaveConversation(conversationId)}
            onDone={() => {
              toast.success("You left the group.")
              router.push("/messages")
            }}
          />
        </div>

        {removeTarget ? (
          <ConfirmDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            title={`Remove ${removeTarget.name} from the group?`}
            description={`@${removeTarget.handle} stops getting this group's messages and can't see it. Anyone in the group can add them back.${
              info?.inviteToken ? " The invite link is on, so they could join again with it. Reset the link to stop that." : ""
            }`}
            confirmLabel="Remove"
            action={() => removeFromGroup(conversationId, removeTarget.id)}
            onDone={() => {
              toast.success(`Removed @${removeTarget.handle} from the group.`)
              void reload()
              router.refresh()
            }}
          />
        ) : null}
        {proof.dialog}
      </DialogContent>
    </Dialog>
  )
}
