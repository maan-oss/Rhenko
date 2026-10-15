import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { BarChart3, FileText, Heart, Image as ImageIcon, Lock, MessageCircle, Repeat2, Star } from "lucide-react"
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
import { MessageButton, ProfileActions } from "@/components/app/profile-actions"
import { ProfileBanner } from "@/components/app/profile-banner"
import { ProfileVisit } from "@/components/app/profile-visit"
import { ProfileEditDialog } from "@/components/app/profile-edit"
import { AiLabel, LockedBadge, SubscriberBadge, VerifiedBadge } from "@/components/app/badges"
import { IconTabs, TabLinks } from "@/components/app/tabs"
import { BannerTabTheme } from "@/components/app/tab-theme"
import { NumberTicker } from "@/components/ui/number-ticker"

type Params = Promise<{ handle: string }>
type SearchParams = Promise<{ tab?: string | string[] }>

// Every feed a profile can show. Highlights is one of them, but it lives inside the Posts section.
const FEEDS: ProfileTab[] = ["posts", "highlights", "replies", "media", "reposts", "likes"]

// The main tab row. Highlights is merged into Posts, so the row has five sections.
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

const SECTION_ICON: Record<ProfileTab, ReactNode> = {
  posts: <FileText />,
  highlights: <Star />,
  replies: <MessageCircle />,
  media: <ImageIcon />,
  reposts: <Repeat2 />,
  likes: <Heart />,
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
  const base = `/${profile.handle}`
  const sections = SECTIONS.filter((t) => t !== "likes" || isSelf)

  // Mutual followers only show where the profile itself is visible to the viewer.
  const showMutual = !isSelf && !rel.blockedByMe && (!profile.protected || rel.following)
  const mutual = showMutual ? mutualFollowers(profile.id, viewer.id) : null

  return (
    <>
      <PageHeader title={profile.name} backHref="/" />
      {isSelf ? null : <ProfileVisit profileId={profile.id} />}

      {/* The banner is a box of its own. Its edge stays put, and the colour stays inside it. */}
      <div className="px-4 pt-4">
        <ProfileBanner file={profile.bannerFile} handle={profile.handle} className="h-36 sm:h-52" />
      </div>

      <div className="relative z-10 flex items-end justify-between gap-3 px-4">
        <div className="-mt-12 rounded-full bg-background p-1.5">
          <Avatar user={profile} size={96} />
        </div>
        <div className="flex items-center gap-2 pb-1">
          {isSelf ? (
            <>
              <Link
                href="/analytics"
                className="glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
              >
                <BarChart3 className="size-4" />
                Analytics
              </Link>
              <ProfileEditDialog defaults={{ name: profile.name, bio: profile.bio }} />
            </>
          ) : (
            <ProfileActions handle={profile.handle} state={followState} blocked={rel.blockedByMe} muted={rel.muted} notifying={profile.notifying} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[26px] leading-tight font-semibold tracking-tight sm:text-3xl">
            {profile.name}
            {profile.verified ? <VerifiedBadge /> : null}
            {profile.paidVerified ? <SubscriberBadge /> : null}
            {profile.bot ? <AiLabel /> : null}
            {profile.protected ? <LockedBadge /> : null}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
            @{profile.handle}
            {rel.followsMe && !isSelf ? (
              <span className="glass rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground">Follows you</span>
            ) : null}
          </p>
          {profile.status ? <p className="glass mt-1 w-fit max-w-full truncate rounded-full px-3 py-1 text-sm">{profile.status}</p> : null}
        </div>

        {rel.blockedByMe && !isSelf ? (
          <p className="glass rounded-2xl px-3 py-2 text-sm">You blocked this account. Unblock it from the menu to see its posts.</p>
        ) : null}
        {profile.bio ? <p className="text-[15px] leading-relaxed whitespace-pre-line">{profile.bio}</p> : null}
        {mutual && mutual.total > 0 ? <MutualLine users={mutual.users} total={mutual.total} /> : null}

        <ProfileStrip base={base} following={profile.following} followers={profile.followers} joined={String(new Date(profile.createdAt).getFullYear())} />

        {isSelf ? null : <MessageButton handle={profile.handle} />}
      </div>

      <BannerTabTheme src={profile.bannerFile ? `/media/${profile.bannerFile}?w=640` : null}>
        <IconTabs
          label="Profile sections"
          items={sections.map((t) => ({
            href: t === "posts" ? base : `${base}?tab=${t}`,
            label: SECTION_LABEL[t],
            icon: SECTION_ICON[t],
            active: t === section,
          }))}
        />
      </BannerTabTheme>

      {section === "posts" ? (
        <div className="px-4 pt-3">
          <TabLinks
            label="Posts or highlights"
            items={[
              { href: base, label: "All posts", icon: SECTION_ICON.posts, active: tab === "posts" },
              { href: `${base}?tab=highlights`, label: SECTION_LABEL.highlights, icon: SECTION_ICON.highlights, active: tab === "highlights" },
            ]}
          />
        </div>
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

// The long strip under the bio: following, followers, and the About page. One box, three cells, each a link.
function ProfileStrip({ base, following, followers, joined }: { base: string; following: number; followers: number; joined: string }) {
  return (
    <nav aria-label="Following, followers and about" className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-card">
      <StripCell href={`${base}/following`} value={following} label="Following" />
      <StripCell href={`${base}/followers`} value={followers} label={pluralize(followers, "Follower")} />
      <StripCell href={`${base}/about`} label={`Joined ${joined}`}>
        About
      </StripCell>
    </nav>
  )
}

function StripCell({ href, value, label, children }: { href: string; value?: number; label: string; children?: ReactNode }) {
  return (
    <Link href={href} className="flex min-w-0 flex-col gap-0.5 px-3.5 py-3 transition-colors hover:bg-muted/60 sm:px-5">
      <span className="truncate text-[17px] leading-tight font-semibold tabular-nums text-foreground">
        {value !== undefined ? <NumberTicker value={value} /> : children}
      </span>
      <span className="truncate text-[13px] text-muted-foreground">{label}</span>
    </Link>
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
