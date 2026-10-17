import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { BarChart3, Lock } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { canSeePost, getPost, getProfileByHandle, mutualFollowers, type MiniUser, type ProfileTab } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { formatCount, pluralize } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/app/avatar"
import { FeedList } from "@/components/app/feed-list"
import type { FollowState } from "@/components/app/follow-button"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"
import { MessageButton, ProfileActions } from "@/components/app/profile-actions"
import { ProfileBanner } from "@/components/app/profile-banner"
import { ProfileVisit } from "@/components/app/profile-visit"
import { ProfileEditDialog } from "@/components/app/profile-edit"
import { ProfileTabs } from "@/components/app/profile-tabs"
import { AiLabel, LockedBadge, SubscriberBadge, VerifiedBadge } from "@/components/app/badges"
import { NumberTicker } from "@/components/ui/number-ticker"

type Params = Promise<{ handle: string }>
type SearchParams = Promise<{ tab?: string | string[]; from?: string | string[] }>

// Every feed a profile can show. Highlights is one of them, but it lives inside the Posts section.
const FEEDS: ProfileTab[] = ["posts", "highlights", "replies", "media", "reposts", "likes"]

// The section pills. Highlights is merged into Posts, so the track has five sections.
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
  const profile = await getProfileByHandle(handle, viewer.id)
  if (!profile || (profile.deactivated && profile.id !== viewer.id) || profile.relationship.blockedMe) notFound()
  return <ProfileBody params={params} searchParams={searchParams} />
}

async function ProfileBody({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const { handle } = await params
  const profile = await getProfileByHandle(handle, viewer.id)
  const isSelf = profile?.id === viewer.id
  if (!profile || (profile.deactivated && !isSelf) || profile.relationship.blockedMe) notFound()

  const rel = profile.relationship
  const requestedParam = firstParam((await searchParams).tab)
  const requested = FEEDS.find((t) => t === requestedParam)
  // Likes are only listed for the account's owner.
  const tab: ProfileTab = requested && (requested !== "likes" || isSelf) ? requested : "posts"
  const section = SECTION_OF[tab]

  const spec: FeedSpec = { kind: "profile", tab, handle: profile.handle }
  const page = await feedFor(spec, viewer.id)
  const locked = page.locked === true
  // The pinned post shows only where the profile's posts do, and only when this viewer may see that post.
  const pinned =
    tab === "posts" && !locked && profile.pinnedPostId && await canSeePost(profile.pinnedPostId, viewer.id) ? await getPost(profile.pinnedPostId, viewer.id) : null
  const followState: FollowState = rel.following ? "following" : rel.requested ? "requested" : "none"
  // A profile opened from one of this account's posts credits a follow to that post. The post must be theirs and visible
  // to the viewer; anything else is ignored, and the follow still happens.
  const fromParam = firstParam((await searchParams).from)
  const fromPost = fromParam && !isSelf && await canSeePost(fromParam, viewer.id) && (await getPost(fromParam, viewer.id))?.author.id === profile.id ? fromParam : undefined
  const base = `/${profile.handle}`
  const sections = SECTIONS.filter((t) => t !== "likes" || isSelf)

  // Mutual followers only show where the profile itself is visible to the viewer.
  const showMutual = !isSelf && !rel.blockedByMe && (!profile.protected || rel.following)
  const mutual = showMutual ? await mutualFollowers(profile.id, viewer.id) : null

  return (
    <>
      <PageHeader title={profile.name} subtitle={`${formatCount(profile.posts)} ${pluralize(profile.posts, "post")}`} backHref="/" />
      {isSelf ? null : <ProfileVisit profileId={profile.id} />}

      {/* The banner fades into the page along its lower edge. Its photo, or the drawing made from the handle, is the profile's own. */}
      <div className="px-4 pt-4">
        <ProfileBanner file={profile.bannerFile} handle={profile.handle} className="h-36 sm:h-52" />
      </div>

      {/* The avatar hangs over the banner's lower edge. The buttons sit on the same row, so they never run under it. */}
      <div className="relative z-10 flex items-end justify-between gap-3 px-4">
        <div className="-mt-12 rounded-full bg-background p-1.5">
          <Avatar user={profile} size={96} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 pb-1">
          {isSelf ? (
            <>
              <Link
                href="/analytics"
                className="glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
              >
                <BarChart3 className="size-4" aria-hidden="true" />
                <span className="max-[389px]:sr-only">Analytics</span>
              </Link>
              <ProfileEditDialog defaults={{ name: profile.name, bio: profile.bio }} />
            </>
          ) : (
            <ProfileActions handle={profile.handle} state={followState} blocked={rel.blockedByMe} muted={rel.muted} notifying={profile.notifying} from={fromPost} />
          )}
        </div>
      </div>

      <section className="flex flex-col gap-5 px-4 pt-4 pb-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl leading-tight font-semibold tracking-tight">
              {profile.name}
              {profile.verified ? <VerifiedBadge /> : null}
              {profile.paidVerified ? <SubscriberBadge /> : null}
              {profile.bot ? <AiLabel /> : null}
              {profile.protected ? <LockedBadge /> : null}
            </h2>
            <p className="flex flex-wrap items-center gap-2 text-[15px] leading-5 text-muted-foreground">
              @{profile.handle}
              {rel.followsMe && !isSelf ? (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">Follows you</span>
              ) : null}
            </p>
          </div>

          {rel.blockedByMe && !isSelf ? (
            <p className="glass rounded-2xl px-3 py-2 text-sm">You blocked this account. Unblock it from the menu to see its posts.</p>
          ) : null}
          {profile.status ? <p className="text-[15px] leading-6">{profile.status}</p> : null}
          {profile.bio ? <p className="text-[15px] leading-6 whitespace-pre-line">{profile.bio}</p> : null}
          <Link href={`${base}/about`} className="w-fit text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline">
            Joined {String(new Date(profile.createdAt).getFullYear())}
          </Link>
        </div>

        <ProfileStats base={base} following={profile.following} followers={profile.followers} />
        {mutual && mutual.total > 0 ? <MutualLine users={mutual.users} total={mutual.total} /> : null}
        {isSelf ? null : <MessageButton handle={profile.handle} />}
      </section>

      <ProfileTabs
        label="Profile sections"
        items={sections.map((t) => ({
          href: t === "posts" ? base : `${base}?tab=${t}`,
          label: SECTION_LABEL[t],
          active: t === section,
        }))}
      />

      {section === "posts" ? (
        <nav aria-label="Posts or highlights" className="flex gap-2 overflow-x-auto px-4 pt-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <div className="mx-4 mt-6 flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border px-5 py-6">
          <span className="grid size-10 place-items-center rounded-full bg-muted text-foreground">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-2 text-lg font-semibold">This account is protected</p>
          <p className="text-muted-foreground">
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

// The two filters under the Posts section. A chosen one is filled in ink, the same as the profile's own tabs.
function FilterChip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-lg border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-foreground bg-foreground text-background" : "border-border text-foreground hover:bg-muted"
      )}
    >
      {children}
    </Link>
  )
}

// Followers and Following as two cells: the number on top, its word under it. Each cell opens its list.
function ProfileStats({ base, following, followers }: { base: string; following: number; followers: number }) {
  return (
    <nav aria-label="Following and followers" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border">
      <StatCell href={`${base}/followers`} value={followers} label={pluralize(followers, "Follower")} />
      <StatCell href={`${base}/following`} value={following} label="Following" divider />
    </nav>
  )
}

function StatCell({ href, value, label, divider = false }: { href: string; value: number; label: string; divider?: boolean }) {
  return (
    <Link href={href} className={cn("flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-muted/60", divider && "border-l border-border")}>
      <span className="text-xl font-semibold tracking-tight tabular-nums">
        <NumberTicker value={value} />
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Link>
  )
}

// "Followed by Ana, Ben and 4 others". Text only: the names carry it.
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
    <p className="text-sm text-muted-foreground">
      Followed by <span className="font-medium text-foreground">{list}</span>
      {others > 0 ? ` and ${others} ${others === 1 ? "other" : "others"}` : null}
    </p>
  )
}
