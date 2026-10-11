import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarDays, Link as LinkIcon, MapPin } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle, profileFeed } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { hostOf, joinedLabel } from "@/lib/format"
import { Avatar } from "@/components/app/avatar"
import { FeedList, MoreLink } from "@/components/app/feed-list"
import { FollowButton } from "@/components/app/follow-button"
import { PageHeader } from "@/components/app/page-header"
import { ProfileEditDialog } from "@/components/app/profile-edit"
import { TabLinks } from "@/components/app/tabs"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

type Params = Promise<{ handle: string }>
type SearchParams = Promise<{ tab?: string | string[]; before?: string | string[] }>

export default function ProfilePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-40" />}>
      <ProfileBody params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function ProfileBody({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const { handle } = await params
  const profile = getProfileByHandle(handle, viewer.id)
  if (!profile) notFound()

  const query = await searchParams
  const tabParam = firstParam(query.tab)
  const tab = tabParam === "replies" || tabParam === "likes" ? tabParam : "posts"
  const page = profileFeed(tab, profile.id, viewer.id, firstParam(query.before))
  const isSelf = profile.id === viewer.id
  const base = `/${profile.handle}`
  const emptyCopy = {
    posts: ["No posts yet", "Posts and reposts show up here."],
    replies: ["No replies yet", "Replies show up here."],
    likes: ["No likes yet", "Posts this person likes show up here."],
  } as const

  return (
    <>
      <PageHeader title={profile.name} backHref="/" />
      <div className="relative h-36 overflow-hidden bg-dusk text-background md:h-44">
        {profile.bannerFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/media/${profile.bannerFile}`} alt="" className="size-full object-cover" />
        ) : (
          <RhenkoSymbol className="absolute -right-8 -bottom-12 size-48 opacity-15" />
        )}
      </div>

      <div className="flex items-end justify-between gap-3 px-4">
        <div className="relative z-10 -mt-12 bg-background p-1">
          <Avatar user={profile} size={96} />
        </div>
        <div className="flex items-center gap-2 pb-1">
          {isSelf ? (
            <ProfileEditDialog
              defaults={{ name: profile.name, bio: profile.bio, location: profile.location, website: profile.website }}
            />
          ) : (
            <>
              <Button variant="outline" render={<Link href={`/messages/${profile.handle}`} />} className="h-8 rounded-lg px-4">
                Message
              </Button>
              <FollowButton handle={profile.handle} following={profile.viewerFollows} />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-4">
        <div>
          <h2 className="text-2xl leading-tight font-semibold">{profile.name}</h2>
          <p className="text-muted-foreground">@{profile.handle}</p>
        </div>
        {profile.bio ? <p className="text-[15px] leading-relaxed whitespace-pre-line">{profile.bio}</p> : null}
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          {profile.location ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4" />
              {profile.location}
            </span>
          ) : null}
          {profile.website ? (
            <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow" className="flex items-center gap-1.5 text-dusk hover:underline">
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
          <p>
            <NumberTicker value={profile.following} className="font-semibold text-foreground" />{" "}
            <span className="text-muted-foreground">Following</span>
          </p>
          <p>
            <NumberTicker value={profile.followers} className="font-semibold text-foreground" />{" "}
            <span className="text-muted-foreground">Followers</span>
          </p>
        </div>
      </div>

      <TabLinks
        items={[
          { href: base, label: "Posts", active: tab === "posts" },
          { href: `${base}?tab=replies`, label: "Replies", active: tab === "replies" },
          { href: `${base}?tab=likes`, label: "Likes", active: tab === "likes" },
        ]}
      />
      <FeedList items={page.items} viewer={viewer} emptyTitle={emptyCopy[tab][0]} emptyBody={emptyCopy[tab][1]} />
      <MoreLink href={page.next ? `${base}?tab=${tab}&before=${encodeURIComponent(page.next)}` : null} />
    </>
  )
}
