import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText, Settings, Users } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { circleBySlug, circleMembers, circleRequests, type Circle } from "@/lib/circles"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { listOwnersVisibleTo } from "@/lib/people-state"
import { ACCESS_LABEL } from "@/components/app/circle-bits"
import { Avatar } from "@/components/app/avatar"
import { Composer } from "@/components/app/composer"
import { EmptyState } from "@/components/app/empty-state"
import { FeedList } from "@/components/app/feed-list"
import { PageHeader } from "@/components/app/page-header"
import {
  AddCircleMemberForm,
  CircleForm,
  CircleMembership,
  CircleRequestRow,
  DeleteCircleButton,
  RemoveCircleMemberButton,
} from "@/components/app/circle-controls"
import { TabLinks } from "@/components/app/tabs"
import { formatCount } from "@/lib/format"

type Params = Promise<{ slug: string }>
type SearchParams = Promise<{ tab?: string | string[] }>

// The circle the viewer may open: it exists, and its owner is not blocked by or blocking the viewer.
async function openCircle(slug: string, viewerId: string): Promise<Circle | null> {
  const circle = await circleBySlug(slug.toLowerCase(), viewerId)
  if (!circle) return null
  if (circle.owner && circle.owner.id !== viewerId && !(await listOwnersVisibleTo(viewerId, [circle.owner.id])).has(circle.owner.id))
    return null
  return circle
}

// Existence checks run before anything streams, so a missing circle gets a real 404.
export const instant = false

export default async function CirclePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  if (!await openCircle((await params).slug, viewer.id)) notFound()
  return <CircleBody params={params} searchParams={searchParams} />
}

async function CircleBody({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const circle = await openCircle((await params).slug, viewer.id)
  if (!circle) notFound()

  const owner = circle.role === "owner"
  const member = circle.role !== null
  // An invite-only circle shows its name and size to anyone, but its charter and posts only to its members.
  const hidden = circle.access === "closed" && !member && !owner

  const requested = firstParam((await searchParams).tab)
  const tab = requested === "members" || (requested === "settings" && owner) ? requested : "posts"
  const spec: FeedSpec = { kind: "circle", circleId: circle.id }
  const page = tab === "posts" && !hidden ? await feedFor(spec, viewer.id) : null

  return (
    <>
      <PageHeader title={circle.name} backHref="/circles" />
      <div className="flex flex-col gap-3 px-4 py-4">
        {circle.tagline ? <p className="text-[15px]">{circle.tagline}</p> : null}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>
            {formatCount(circle.memberCount)} {circle.memberCount === 1 ? "member" : "members"}
          </span>
          <span aria-hidden="true">·</span>
          <span>{ACCESS_LABEL[circle.access]}</span>
          {circle.owner ? (
            <>
              <span aria-hidden="true">·</span>
              <span>Run by @{circle.owner.handle}</span>
            </>
          ) : null}
        </p>
        {!hidden && circle.charter ? (
          <div className="rounded-2xl border border-border px-4 py-3">
            <p className="mb-1 text-sm font-semibold">Charter</p>
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{circle.charter}</p>
          </div>
        ) : null}
        <CircleMembership circle={circle} />
      </div>

      {member && !hidden ? (
        <Composer
          viewer={viewer}
          circle={{ id: circle.id, name: circle.name }}
          placeholder={`Post in ${circle.name}`}
          id="compose"
        />
      ) : null}

      {hidden ? (
        <EmptyState
          title="This circle is invite-only"
          body="Its members decide who joins, and its posts are shown only to them."
        />
      ) : (
        <>
          <div className="px-4 pt-3">
            <TabLinks
              items={[
                { href: `/circles/${circle.slug}`, label: "Posts", icon: <FileText />, active: tab === "posts" },
                { href: `/circles/${circle.slug}?tab=members`, label: "Members", icon: <Users />, active: tab === "members" },
                ...(owner
                  ? [
                      {
                        href: `/circles/${circle.slug}?tab=settings`,
                        label: "Settings",
                        icon: <Settings />,
                        active: tab === "settings",
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          {tab === "posts" && page ? (
            <FeedList
              items={page.items}
              next={page.next}
              spec={spec}
              viewer={viewer}
              emptyTitle="No posts in this circle yet"
              emptyBody={
                member
                  ? "Write the first one above. Members' posts show up here as they write them."
                  : "Posts from its members show up here once they write them."
              }
            />
          ) : tab === "members" ? (
            <MembersPanel circleId={circle.id} owner={owner} viewerId={viewer.id} />
          ) : tab === "settings" && owner ? (
            <SettingsPanel circle={circle} />
          ) : null}
        </>
      )}
    </>
  )
}

async function MembersPanel({ circleId, owner, viewerId }: { circleId: string; owner: boolean; viewerId: string }) {
  const members = await circleMembers(circleId)
  return (
    <>
      {owner ? (
        <div className="border-b border-border px-4 py-4">
          <AddCircleMemberForm circleId={circleId} />
        </div>
      ) : null}
      <ul className="list-none">
        {members.map(({ user, role }) => (
          <li key={user.id} className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Link href={`/${user.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar user={user} size={44} />
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {user.name}
                  {role === "owner" ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">Runs this circle</span>
                  ) : null}
                </span>
                <span className="block truncate text-sm text-muted-foreground">@{user.handle}</span>
              </span>
            </Link>
            {owner && role !== "owner" && user.id !== viewerId ? (
              <RemoveCircleMemberButton circleId={circleId} userId={user.id} handle={user.handle} />
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

async function SettingsPanel({ circle }: { circle: Circle }) {
  const requests = circle.access === "request" ? await circleRequests(circle.id) : []
  return (
    <>
      <section className="border-b border-border">
        <h2 className="px-4 pt-5 pb-1 text-lg font-semibold">Settings</h2>
        <CircleForm circle={circle} />
      </section>
      {circle.access === "request" ? (
        <section className="border-b border-border">
          <h2 className="px-4 pt-5 pb-1 text-lg font-semibold">Asking to join</h2>
          {requests.length === 0 ? (
            <p className="px-4 pb-5 text-muted-foreground">No one is waiting. Requests show up here with the answer they gave.</p>
          ) : (
            <ul className="list-none">
              {requests.map((request) => (
                <CircleRequestRow
                  key={request.user.id}
                  circleId={circle.id}
                  userId={request.user.id}
                  name={request.user.name}
                  handle={request.user.handle}
                  answer={request.answer}
                  question={circle.joinQuestion}
                />
              ))}
            </ul>
          )}
        </section>
      ) : null}
      <section className="px-4 py-4">
        <h2 className="pb-2 text-lg font-semibold">Delete this circle</h2>
        <p className="pb-4 text-[15px] text-muted-foreground">
          {circle.access === "closed"
            ? "Deleting a closed circle also deletes its posts."
            : "Its posts stay on Rhenko as ordinary posts."}
        </p>
        <DeleteCircleButton circleId={circle.id} access={circle.access} />
      </section>
    </>
  )
}
