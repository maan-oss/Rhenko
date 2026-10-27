import Link from "@/components/app/link"
import { notFound } from "next/navigation"
import { Lock, UserCheck, Users } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle, peopleOfPage } from "@/lib/data"
import { formatCount, pluralize } from "@/lib/format"
import { withRequested } from "@/lib/people-state"
import { PEOPLE_PAGE } from "@/lib/social-rules"
import { EmptyState, emptyActionClass } from "@/components/app/empty-state"
import { FollowButton } from "@/components/app/follow-button"
import { PageHeader } from "@/components/app/page-header"
import { PeoplePager } from "@/components/app/people-pager"
import { TabLinks } from "@/components/app/tabs"

type Kind = "followers" | "following"

// Followers or following for one account, with the same visibility rules as the profile.
export async function PeopleBody({ handle, kind }: { handle: string; kind: Kind }) {
  const viewer = await requireViewer()
  const profile = await getProfileByHandle(handle, viewer.id)
  const isSelf = profile?.id === viewer.id
  if (!profile || (profile.deactivated && !isSelf) || profile.relationship.blockedMe) notFound()

  const base = `/${profile.handle}`
  const hidden = profile.protected && !isSelf && !profile.relationship.following
  const page = hidden ? null : await peopleOfPage(kind, profile.id, viewer.id, null, PEOPLE_PAGE)
  return (
    <>
      <PageHeader title={profile.name} backHref={base}>
        <TabLinks
          items={[
            {
              href: `${base}/followers`,
              label: `${formatCount(profile.followers)} ${pluralize(profile.followers, "Follower")}`,
              icon: <Users />,
              active: kind === "followers",
            },
            { href: `${base}/following`, label: `${formatCount(profile.following)} Following`, icon: <UserCheck />, active: kind === "following" },
          ]}
        />
      </PageHeader>
      {page === null ? (
        <ProtectedNotice handle={profile.handle} kind={kind} requested={profile.relationship.requested} />
      ) : (
        <PeoplePager
          // A different account or tab starts again from its first page.
          key={`${profile.id}:${kind}`}
          handle={profile.handle}
          kind={kind}
          viewerId={viewer.id}
          removable={isSelf && kind === "followers"}
          initialUsers={await withRequested(viewer.id, page.users)}
          initialNext={page.next}
          empty={<NoPeople handle={profile.handle} kind={kind} isSelf={isSelf} />}
        />
      )}
    </>
  )
}

// A protected account only shows who follows it, and who it follows, to its own followers.
function ProtectedNotice({ handle, kind, requested }: { handle: string; kind: Kind; requested: boolean }) {
  const reveal = kind === "followers" ? "who follows it" : "who it follows"
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 pt-10 pb-6 text-center">
      <Lock className="size-6" aria-hidden="true" />
      <p className="text-lg font-semibold">This account is protected</p>
      <p className="max-w-sm text-[15px] text-muted-foreground">
        {requested
          ? `Your request to follow @${handle} is waiting. When it's accepted, you can see ${reveal}.`
          : `Follow @${handle} to see ${reveal}. Its owner decides who can follow.`}
      </p>
      <div className="mt-4">
        <FollowButton handle={handle} state={requested ? "requested" : "none"} className="h-11 px-5 text-[15px]" />
      </div>
    </div>
  )
}

function NoPeople({ handle, kind, isSelf }: { handle: string; kind: Kind; isSelf: boolean }) {
  if (kind === "followers") {
    return (
      <EmptyState
        title="No followers yet"
        body={isSelf ? "When someone follows you, they show up here." : `When someone follows @${handle}, they show up here.`}
      />
    )
  }
  if (isSelf) {
    return (
      <EmptyState title="You aren't following anyone yet" body="Follow people and their posts fill your Following feed.">
        <Link href="/explore" className={emptyActionClass("primary")}>
          Find people to follow
        </Link>
      </EmptyState>
    )
  }
  return <EmptyState title={`@${handle} isn't following anyone yet`} body="The people they follow show up here." />
}
