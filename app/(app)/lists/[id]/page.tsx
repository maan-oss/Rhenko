import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText, Lock, Users } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { listDetail } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { Avatar } from "@/components/app/avatar"
import { EmptyState } from "@/components/app/empty-state"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import { DeleteListButton, ListFollowButton, ListMemberForm, RemoveMemberButton } from "@/components/app/list-controls"
import { TabLinks } from "@/components/app/tabs"
import { formatCount } from "@/lib/format"

type Params = Promise<{ id: string }>
type SearchParams = Promise<{ tab?: string | string[] }>

// A list the viewer may open: it exists, it is theirs or public, and its owner is still here and hasn't blocked them.
function openList(id: string, viewerId: string) {
  const detail = listDetail(id, viewerId)
  if (!detail) return null
  if (!detail.list.isOwner && !listOwnersVisibleTo(viewerId, [detail.list.owner.id]).has(detail.list.owner.id)) return null
  return detail
}

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

export default async function ListPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  if (!openList((await params).id, viewer.id)) notFound()
  return <ListBody params={params} searchParams={searchParams} />
}

async function ListBody({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const { id } = await params
  const detail = openList(id, viewer.id)
  if (!detail) notFound()
  const { list, members } = detail
  const tab = firstParam((await searchParams).tab) === "members" ? "members" : "posts"
  const spec: FeedSpec = { kind: "list", listId: list.id }
  const page = tab === "posts" ? feedFor(spec, viewer.id) : null

  return (
    <>
      <PageHeader title={list.name} backHref="/lists" />
      <div className="flex flex-col gap-3 px-4 py-4">
        {list.description ? <p className="text-[15px]">{list.description}</p> : null}
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {list.private ? (
            <span className="flex items-center gap-1">
              <Lock className="size-3.5" /> Private. Only you can see it.
            </span>
          ) : null}
          <span>
            {formatCount(list.memberCount)} {list.memberCount === 1 ? "member" : "members"}
          </span>
          <span>· Made by @{list.owner.handle}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {list.isOwner ? (
            <DeleteListButton listId={list.id} />
          ) : list.private ? null : (
            <ListFollowButton listId={list.id} following={list.followed} />
          )}
        </div>
      </div>

      {list.isOwner ? (
        <div className="border-b border-border px-4 py-4">
          <ListMemberForm listId={list.id} />
        </div>
      ) : null}

      <div className="px-4 pt-3">
        <TabLinks
          items={[
            { href: `/lists/${list.id}`, label: "Posts", icon: <FileText />, active: tab === "posts" },
            { href: `/lists/${list.id}?tab=members`, label: "Members", icon: <Users />, active: tab === "members" },
          ]}
        />
      </div>

      {tab === "posts" && page ? (
        <FeedList
          items={page.items}
          next={page.next}
          spec={spec}
          viewer={viewer}
          emptyTitle={members.length === 0 ? "This list is empty" : "No posts from this list yet"}
          emptyBody={
            members.length === 0
              ? list.isOwner
                ? "Add people by handle above, and their posts show up here."
                : "Nobody is on this list yet. Posts show up here once the owner adds people."
              : "Posts from the people on this list show up here as they write them."
          }
        />
      ) : members.length === 0 ? (
        <EmptyState
          title="Nobody is on this list"
          body={list.isOwner ? "Add a person by handle above and they appear here." : "The owner hasn't added anyone yet."}
        />
      ) : (
        <ul className="list-none">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Link href={`/${member.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={member} size={44} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{member.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">@{member.handle}</span>
                </span>
              </Link>
              {list.isOwner ? <RemoveMemberButton listId={list.id} userId={member.id} handle={member.handle} /> : null}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
