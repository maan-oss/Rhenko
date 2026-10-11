import Link from "next/link"
import { notFound } from "next/navigation"
import { BarChart3, CalendarDays, Link as LinkIcon, Lock, MapPin } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { getPost, getProfileByHandle, type ProfileTab } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { hostOf, joinedLabel } from "@/lib/format"
import { Avatar } from "@/components/app/avatar"
import { FeedList } from "@/components/app/feed-list"
import type { FollowState } from "@/components/app/follow-button"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"
import { ProfileActions } from "@/components/app/profile-actions"
import { ProfileVisit } from "@/components/app/profile-visit"
import { ProfileEditDialog } from "@/components/app/profile-edit"
import { LockedBadge, VerifiedBadge } from "@/components/app/badges"
import { TabLinks } from "@/components/app/tabs"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { NumberTicker } from "@/components/ui/number-ticker"

type Params = Promise<{ handle: string }>
type SearchParams = Promise<{ tab?: string | string[] }>

const TABS: ProfileTab[] = ["posts", "replies", "media", "likes", "highlights"]

const EMPTY: Record<ProfileTab, [string, string]> = {
  posts: ["No posts yet", "Posts and reposts show up here."],
  replies: ["No replies yet", "Replies show up here."],
  media: ["No media yet", "Photos and videos show up here."],
  likes: ["No likes yet", "Posts this person likes show up here."],
  highlights: ["No highlights yet", "Posts this person highlights show up here."],
}

const LABELS: Record<ProfileTab, string> = {
  posts: "Posts",
  replies: "Replies",
  media: "Media",
  likes: "Likes",
  highlights: "Highlights",
}

// Nothing here streams: the existence checks run first, so a missing account gets a real 404.
export const instant = false

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const { handle } = await params
  const profile = getProfileByHandle(handle, viewer.id)
  if (!profile || (profile.deactivated && profile.id !== viewer.id) || profile.relationship.blockedMe) notFound()
  return <ProfileBody params={params} searchParams={searchParams} />
}

async function ProfileBody({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const { handle } = await params
  const profile = getProfileByHandle(handle, viewer.id)
  const isSelf = profile?.id === viewer.id
  if (!profile || (profile.deactivated && !isSelf) || profile.relationship.blockedMe) notFound()

  const rel = profile.relationship
  const requestedParam = firstParam((await searchParams).tab)
  const requested = TABS.find((t) => t === requestedParam)
  // Likes are only listed for the account's owner.
  const tab: ProfileTab = requested && (requested !== "likes" || isSelf) ? requested : "posts"

  const spec: FeedSpec = { kind: "profile", tab, handle: profile.handle }
  const page = feedFor(spec, viewer.id)
  const locked = page.locked === true
  const pinned = tab === "posts" && profile.pinnedPostId ? getPost(profile.pinnedPostId, viewer.id) : null
  const followState: FollowState = rel.following ? "following" : rel.requested ? "requested" : "none"
  const base = `/${profile.handle}`
  const tabs = TABS.filter((t) => t !== "likes" || isSelf)

  return (
    <>
      <PageHeader title={profile.name} backHref="/" />
      {isSelf ? null : <ProfileVisit profileId={profile.id} />}
      {/* The banner fades into the page below it, so the top of the profile reads as one surface. */}
      <div className="relative h-40 overflow-hidden bg-muted md:h-48">
        {profile.bannerFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${profile.bannerFile}`} alt="" className="size-full object-cover" />
        ) : (
          <RhenkoSymbol className="absolute -top-6 -right-10 size-56 text-foreground opacity-[0.07]" />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_30%,var(--background)_100%)]" />
      </div>

      <div className="flex items-end justify-between gap-3 px-4">
        <div className="relative z-10 -mt-14 rounded-full bg-background p-1">
          <Avatar user={profile} size={96} />
        </div>
        <div className="flex items-center gap-2 pb-1">
          {isSelf ? (
            <>
              <Link
                href="/analytics"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-semibold transition-colors hover:bg-muted"
              >
                <BarChart3 className="size-4" />
                Analytics
              </Link>
              <ProfileEditDialog defaults={{ name: profile.name, bio: profile.bio, location: profile.location, website: profile.website }} />
            </>
          ) : (
            <ProfileActions handle={profile.handle} state={followState} blocked={rel.blockedByMe} muted={rel.muted} notifying={profile.notifying} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
        <div>
          <h2 className="flex flex-wrap items-center gap-1.5 text-2xl leading-tight font-semibold">
            {profile.name}
            {profile.verified ? <VerifiedBadge /> : null}
            {profile.protected ? <LockedBadge /> : null}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            @{profile.handle}
            {rel.followsMe && !isSelf ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">Follows you</span>
            ) : null}
          </p>
        </div>
        {profile.status ? <p className="w-fit max-w-full truncate rounded-full bg-muted px-3 py-1 text-sm">{profile.status}</p> : null}
        {rel.blockedByMe && !isSelf ? (
          <p className="rounded-xl bg-muted px-3 py-2 text-sm">You blocked this account. Unblock it from the menu to see its posts.</p>
        ) : null}
        {profile.bio ? <p className="text-[15px] leading-relaxed whitespace-pre-line">{profile.bio}</p> : null}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {profile.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" />
              {profile.location}
            </span>
          ) : null}
          {profile.website ? (
            <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 text-foreground underline-offset-4 hover:underline">
              <LinkIcon className="size-4" />
              {hostOf(profile.website)}
            </a>
          ) : null}
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4" />
            Joined {joinedLabel(profile.createdAt)}
          </span>
        </div>
        <div className="flex gap-5 text-[15px]">
          <Link href={`${base}/following`} className="hover:underline">
            <NumberTicker value={profile.following} className="font-semibold text-foreground" />{" "}
            <span className="text-muted-foreground">Following</span>
          </Link>
          <Link href={`${base}/followers`} className="hover:underline">
            <NumberTicker value={profile.followers} className="font-semibold text-foreground" />{" "}
            <span className="text-muted-foreground">Followers</span>
          </Link>
        </div>
      </div>

      <TabLinks
        items={tabs.map((t) => ({
          href: t === "posts" ? base : `${base}?tab=${t}`,
          label: LABELS[t],
          active: t === tab,
        }))}
      />

      {pinned ? <PostCard post={pinned} viewer={viewer} showPinned /> : null}

      {locked ? (
        <div className="flex flex-col items-center gap-1.5 px-6 pt-14 pb-16 text-center">
          <Lock className="size-6" aria-hidden="true" />
          <p className="text-lg font-semibold">This account is protected</p>
          <p className="max-w-sm text-muted-foreground">
            {rel.requested ? "Your follow request is pending. Their posts show once they accept." : `Follow @${profile.handle} to see their posts.`}
          </p>
        </div>
      ) : (
        <FeedList
          key={tab}
          items={page.items}
          next={page.next}
          spec={spec}
          viewer={viewer}
          emptyTitle={EMPTY[tab][0]}
          emptyBody={EMPTY[tab][1]}
        />
      )}
    </>
  )
}
