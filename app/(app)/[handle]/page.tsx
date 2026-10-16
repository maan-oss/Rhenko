import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { BarChart3, CalendarDays, Lock } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { canSeePost, getPost, getProfileByHandle, mutualFollowers, type MiniUser, type ProfileTab } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { pluralize } from "@/lib/format"
import { Avatar } from "@/components/app/avatar"
import { FeedList } from "@/components/app/feed-list"
import type { FollowState } from "@/components/app/follow-button"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"
import { ProfileActions } from "@/components/app/profile-actions"
import { ProfileBanner } from "@/components/app/profile-banner"
import { ProfileVisit } from "@/components/app/profile-visit"
import { ProfileEditDialog } from "@/components/app/profile-edit"
import { TabLinks } from "@/components/app/tabs"
import { AiLabel, LockedBadge, SubscriberBadge, VerifiedBadge } from "@/components/app/badges"
import { NumberTicker } from "@/components/ui/number-ticker"

type Params = Promise<{ handle: string }>
type SearchParams = Promise<{ tab?: string | string[]; from?: string | string[] }>

// Every feed a profile can show. Highlights is one of them, but it lives inside the Posts section.
const FEEDS: ProfileTab[] = ["posts", "highlights", "replies", "media", "reposts", "likes"]

// The tab row. Highlights is merged into Posts, so the row has five sections.
const SECTIONS: ProfileTab[] = ["posts", "replies", "media", "reposts", "likes"]

const SECTION_OF: Record<ProfileTab, ProfileTab> = {
  posts: "posts",
  highlights: "posts",
  replies: "replies",
  media: "media",
  reposts: "reposts",
  likes: "likes",
}

const SECTION_LABEL: Record<ProfileTab, string> = {
  posts: "Posts",
  highlights: "Highlights",
  replies: "Replies",
  media: "Media",
  reposts: "Reposts",
  likes: "Likes",
}

const EMPTY: Record<ProfileTab, [string, string]> = {
  posts: ["No posts yet", "Posts show up here."],
  highlights: ["No highlights yet", "Posts this person highlights show up here."],
  replies: ["No replies yet", "Replies show up here."],
  media: ["No media yet", "Photos and videos show up here."],
  reposts: ["No reposts yet", "Posts this person reposts show up here."],
  likes: ["No likes yet", "Posts this person likes show up here."],
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
  const requested = FEEDS.find((t) => t === requestedParam)
  // Likes are only listed for the account's owner.
  const tab: ProfileTab = requested && (requested !== "likes" || isSelf) ? requested : "posts"
  const section = SECTION_OF[tab]

  const spec: FeedSpec = { kind: "profile", tab, handle: profile.handle }
  const page = feedFor(spec, viewer.id)
  const locked = page.locked === true
  // The pinned post shows only where the profile's posts do, and only when this viewer may see that post.
  const pinned =
    tab === "posts" && !locked && profile.pinnedPostId && canSeePost(profile.pinnedPostId, viewer.id) ? getPost(profile.pinnedPostId, viewer.id) : null
  const followState: FollowState = rel.following ? "following" : rel.requested ? "requested" : "none"
  // A profile opened from one of this account's posts credits a follow to that post. The post must be theirs and visible
  // to the viewer; anything else is ignored, and the follow still happens.
  const fromParam = firstParam((await searchParams).from)
  const fromPost = fromParam && !isSelf && canSeePost(fromParam, viewer.id) && getPost(fromParam, viewer.id)?.author.id === profile.id ? fromParam : undefined
  const base = `/${profile.handle}`
  const sections = SECTIONS.filter((t) => t !== "likes" || isSelf)

  // Mutual followers only show where the profile itself is visible to the viewer.
  const showMutual = !isSelf && !rel.blockedByMe && (!profile.protected || rel.following)
  const mutual = showMutual ? mutualFollowers(profile.id, viewer.id) : null

  return (
    <>
      <PageHeader title={profile.name} backHref="/" />
      {isSelf ? null : <ProfileVisit profileId={profile.id} />}

      {/* The banner runs edge to edge under the header, as on X. The avatar sits over its lower edge. */}
      <ProfileBanner file={profile.bannerFile} handle={profile.handle} className="h-40 rounded-none border-0 sm:h-52" />

      <div className="relative z-10 flex items-end justify-between gap-3 px-4">
        <div className="-mt-13 rounded-full bg-background p-1">
          <Avatar user={profile} size={104} />
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2 pb-1">
          {isSelf ? (
            <>
              <Link
                href="/analytics"
                aria-label="Analytics"
                title="Analytics"
                className="grid size-9 place-items-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted"
              >
                <BarChart3 className="size-4" aria-hidden="true" />
              </Link>
              <ProfileEditDialog defaults={{ name: profile.name, bio: profile.bio }} />
            </>
          ) : (
            <ProfileActions handle={profile.handle} state={followState} blocked={rel.blockedByMe} muted={rel.muted} notifying={profile.notifying} from={fromPost} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
        <div className="flex flex-col">
          <h2 className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xl leading-7 font-bold tracking-tight">
            {profile.name}
            {profile.verified ? <VerifiedBadge /> : null}
            {profile.paidVerified ? <SubscriberBadge /> : null}
            {profile.bot ? <AiLabel /> : null}
            {profile.protected ? <LockedBadge /> : null}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-[15px] leading-5 text-muted-foreground">
            @{profile.handle}
            {rel.followsMe && !isSelf ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">Follows you</span>
            ) : null}
          </p>
        </div>

        {rel.blockedByMe && !isSelf ? (
          <p className="glass rounded-2xl px-3 py-2 text-sm">You blocked this account. Unblock it from the menu to see its posts.</p>
        ) : null}
        {profile.status ? <p className="text-[15px] leading-6">{profile.status}</p> : null}
        {profile.bio ? <p className="text-[15px] leading-6 whitespace-pre-line">{profile.bio}</p> : null}

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-muted-foreground">
          <Link href={`${base}/about`} className="inline-flex items-center gap-1.5 hover:underline">
            <CalendarDays className="size-4" aria-hidden="true" />
            Joined {String(new Date(profile.createdAt).getFullYear())}
          </Link>
        </p>

        <ProfileCounts base={base} following={profile.following} followers={profile.followers} />
        {mutual && mutual.total > 0 ? <MutualLine users={mutual.users} total={mutual.total} /> : null}
      </div>

      <TabLinks
        label="Profile sections"
        items={sections.map((t) => ({
          href: t === "posts" ? base : `${base}?tab=${t}`,
          label: SECTION_LABEL[t],
          active: t === section,
        }))}
      />

      {section === "posts" ? (
        <nav aria-label="Posts or highlights" className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterChip href={base} active={tab === "posts"}>
            All posts
          </FilterChip>
          <FilterChip href={`${base}?tab=highlights`} active={tab === "highlights"}>
            Highlights
          </FilterChip>
        </nav>
      ) : null}

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

// The two switches under the Posts tab. Same chips as For you's topic filter.
function FilterChip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={
        "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        (active ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted")
      }
    >
      {children}
    </Link>
  )
}

// Following and followers, as X writes them: the number in bold, its word after it. Each one is a link.
function ProfileCounts({ base, following, followers }: { base: string; following: number; followers: number }) {
  return (
    <nav aria-label="Following and followers" className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
      <Link href={`${base}/following`} className="hover:underline">
        <span className="font-bold text-foreground tabular-nums">
          <NumberTicker value={following} />
        </span>{" "}
        <span className="text-muted-foreground">Following</span>
      </Link>
      <Link href={`${base}/followers`} className="hover:underline">
        <span className="font-bold text-foreground tabular-nums">
          <NumberTicker value={followers} />
        </span>{" "}
        <span className="text-muted-foreground">{pluralize(followers, "Follower")}</span>
      </Link>
    </nav>
  )
}

// "Followed by Ana, Ben and 4 others", with the first few avatars overlapping.
function MutualLine({ users, total }: { users: MiniUser[]; total: number }) {
  const names = users.map((u) => u.name)
  const others = total - names.length
  const list =
    others > 0
      ? names.join(", ")
      : names.length <= 1
        ? (names[0] ?? "")
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
      <div className="flex shrink-0 -space-x-2">
        {users.map((u) => (
          <span key={u.id} className="rounded-full ring-2 ring-background">
            <Avatar user={u} size={22} />
          </span>
        ))}
      </div>
      <p className="min-w-0">
        Followed by <span className="font-medium text-foreground">{list}</span>
        {others > 0 ? ` and ${others} ${others === 1 ? "other" : "others"}` : null}
      </p>
    </div>
  )
}
