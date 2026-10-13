import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { BarChart3, CalendarDays, FileText, Heart, Image as ImageIcon, Languages, Link as LinkIcon, Lock, MapPin, MessageCircle, Repeat2, Star } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { canSeePost, getPost, getProfileByHandle, mutualFollowers, type MiniUser, type ProfileTab } from "@/lib/data"
import { feedFor, type FeedSpec } from "@/lib/feeds"
import { firstParam } from "@/lib/params"
import { hostOf, joinedLabel, pluralize } from "@/lib/format"
import { languageName, SPEAK_LEVELS } from "@/lib/languages"
import { Avatar } from "@/components/app/avatar"
import { FeedList } from "@/components/app/feed-list"
import type { FollowState } from "@/components/app/follow-button"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"
import { MessageButton, ProfileActions } from "@/components/app/profile-actions"
import { ProfileVisit } from "@/components/app/profile-visit"
import { ProfileEditDialog } from "@/components/app/profile-edit"
import { LockedBadge, SubscriberBadge, VerifiedBadge } from "@/components/app/badges"
import { IconTabs, TabLinks } from "@/components/app/tabs"
import { RhenkoSymbol } from "@/components/brand/symbol"
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
      {/* The banner fades into the page below it, so the top of the profile reads as one surface. */}
      <div className="relative h-40 overflow-hidden bg-muted md:h-48">
        {profile.bannerFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${profile.bannerFile}?w=1280`} alt="" decoding="async" className="size-full object-cover" />
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
                className="glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/5"
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
            {profile.paidVerified ? <SubscriberBadge /> : null}
            {profile.protected ? <LockedBadge /> : null}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            @{profile.handle}
            {rel.followsMe && !isSelf ? (
              <span className="glass rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground">Follows you</span>
            ) : null}
          </p>
          {profile.status ? <p className="glass mt-2 w-fit max-w-full truncate rounded-full px-3 py-1 text-sm">{profile.status}</p> : null}
        </div>
        {rel.blockedByMe && !isSelf ? (
          <p className="glass rounded-2xl px-3 py-2 text-sm">You blocked this account. Unblock it from the menu to see its posts.</p>
        ) : null}
        {profile.bio ? <p className="text-[15px] leading-relaxed whitespace-pre-line">{profile.bio}</p> : null}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {profile.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" />
              {profile.location}
            </span>
          ) : null}
          {profile.languages.speak.length > 0 || profile.languages.learn.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <Languages className="size-4" aria-hidden="true" />
              <span>{languagesLine(profile.languages)}</span>
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
            <span className="text-muted-foreground">{pluralize(profile.followers, "Follower")}</span>
          </Link>
        </div>
        {mutual && mutual.total > 0 ? <MutualLine users={mutual.users} total={mutual.total} /> : null}
        {isSelf ? null : <MessageButton handle={profile.handle} />}
      </div>

      <IconTabs
        label="Profile sections"
        items={sections.map((t) => ({
          href: t === "posts" ? base : `${base}?tab=${t}`,
          label: SECTION_LABEL[t],
          icon: SECTION_ICON[t],
          active: t === section,
        }))}
      />

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

// "Speaks English (native), Spanish (fluent). Learning French." Written as sentences, so it reads the same everywhere.
function languagesLine(languages: { speak: { code: string; level: string }[]; learn: string[] }): string {
  const sentences: string[] = []
  if (languages.speak.length > 0) {
    const spoken = languages.speak.map((item) => {
      const name = languageName(item.code) ?? item.code
      const level = SPEAK_LEVELS.find((option) => option.id === item.level)?.label
      return level ? `${name} (${level.toLowerCase()})` : name
    })
    sentences.push(`Speaks ${spoken.join(", ")}.`)
  }
  if (languages.learn.length > 0) {
    sentences.push(`Learning ${languages.learn.map((code) => languageName(code) ?? code).join(", ")}.`)
  }
  return sentences.join(" ")
}
