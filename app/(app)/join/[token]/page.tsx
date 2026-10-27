import { notFound, redirect } from "next/navigation"
import { Users } from "lucide-react"
import { getViewer } from "@/lib/auth"
import { formatCount, pluralize } from "@/lib/format"
import { groupForInvite, inviteStanding } from "@/lib/group-invites"
import { joinPath, loginPathFor } from "@/lib/invite-links"
import { MAX_GROUP_MEMBERS } from "@/lib/rules"
import { JoinGroupButton } from "@/components/app/join-group-button"
import { PageHeader } from "@/components/app/page-header"

type Params = Promise<{ token: string }>

// The link is checked before anything streams, here and in the proxy (lib/route-gate.ts), so a link that was reset or
// turned off gets the same "This page is not here" view, with a real 404, as any other missing page.
export const instant = false

// What an invite link opens: the group's name, how many people are in it, and a Join button. Someone who is signed out is
// sent to sign in and comes back here. Someone already in the group goes straight to it.
export default async function JoinGroupPage({ params }: { params: Params }) {
  const { token } = await params
  const viewer = await getViewer()
  if (!viewer) redirect(loginPathFor(joinPath(token)))
  const invite = await groupForInvite(token)
  if (!invite) notFound()
  const standing = await inviteStanding(invite.conversationId, viewer.id)
  if (standing.status === "accepted") redirect(`/messages/${invite.conversationId}`)

  const count = invite.memberCount
  const people = `${formatCount(count)} ${pluralize(count, "person", "people")}`
  const named = invite.title !== ""
  const title = named ? invite.title : "Group chat"
  // Someone invited already holds a place, so a full group still lets them in.
  const full = standing.status === null && count >= MAX_GROUP_MEMBERS

  return (
    <>
      <PageHeader title="Group invite" backHref="/messages" />
      <section className="flex flex-col items-center px-6 pt-12 pb-10 text-center">
        <span aria-hidden="true" className="glass grid size-20 place-items-center rounded-full text-foreground">
          <Users className="size-8" strokeWidth={1.8} />
        </span>
        <h2 className="mt-5 max-w-full text-[24px] leading-tight font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</h2>
        <p className="mt-1.5 text-[15px] text-muted-foreground">{named ? `Group chat · ${people}` : people}</p>
        <div className="mt-7 flex w-full max-w-xs flex-col items-center">
          {standing.blocked ? (
            <p className="w-full rounded-2xl bg-muted px-4 py-3 text-[15px]">You can&apos;t join this group.</p>
          ) : full ? (
            <p className="w-full rounded-2xl bg-muted px-4 py-3 text-[15px]">
              This group is full. Groups can have up to {MAX_GROUP_MEMBERS} people.
            </p>
          ) : (
            <JoinGroupButton token={token} title={title} />
          )}
        </div>
        {standing.blocked || full ? null : (
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {standing.status === "requested"
              ? "You're invited to this group already. Joining accepts the invite. "
              : "You join straight away, with no approval. "}
            Everyone in the group sees your name and handle, and you see theirs and the group&apos;s messages.
          </p>
        )}
      </section>
    </>
  )
}
