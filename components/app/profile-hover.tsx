"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { PreviewCard } from "@base-ui/react/preview-card"
import { Avatar } from "@/components/app/avatar"
import { SubscriberBadge, VerifiedBadge } from "@/components/app/badges"
import { FollowButton, type FollowState } from "@/components/app/follow-button"
import { Skeleton } from "@/components/ui/skeleton"

type Card = {
  handle: string
  name: string
  bio: string
  avatarFile: string | null
  verified: boolean
  paidVerified: boolean
  followers: number
  following: number
  self: boolean
  followsMe: boolean
  blockedByMe: boolean
  state: FollowState
}

// The card is read again each time it opens, so a follow made a moment ago shows as it is.
async function readCard(handle: string): Promise<Card | null> {
  try {
    const response = await fetch(`/api/profile-card?handle=${encodeURIComponent(handle)}`, { headers: { Accept: "application/json" } })
    if (!response.ok) return null
    return (await response.json()) as Card
  } catch {
    return null
  }
}

function CardBody({ handle }: { handle: string }) {
  // undefined: reading. null: the account has no card for this viewer.
  const [card, setCard] = useState<Card | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    readCard(handle).then((next) => {
      if (live) setCard(next)
    })
    return () => {
      live = false
    }
  }, [handle])

  if (card === undefined) {
    return (
      <div aria-hidden className="flex gap-3">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="w-full space-y-2 pt-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    )
  }
  if (card === null) return <p className="text-sm text-muted-foreground">This profile can&apos;t be shown right now.</p>

  return (
    <>
      <div className="flex items-start gap-3">
        <Avatar user={{ id: card.handle, name: card.name, avatarFile: card.avatarFile }} size={56} />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate leading-tight font-semibold">
            {card.name}
            {card.verified ? <VerifiedBadge className="ml-1 inline-block align-[-2px]" /> : null}
            {card.paidVerified ? <SubscriberBadge className="ml-1 inline-block align-[-2px]" /> : null}
          </p>
          <p className="truncate text-sm text-muted-foreground">@{card.handle}</p>
        </div>
      </div>
      {card.bio ? <p className="mt-3 line-clamp-3 text-sm whitespace-pre-line">{card.bio}</p> : null}
      <p className="mt-3 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{card.following.toLocaleString()}</span> Following
        <span className="mx-2">·</span>
        <span className="font-semibold text-foreground">{card.followers.toLocaleString()}</span> Followers
      </p>
      {card.followsMe && !card.self ? (
        <p className="mt-2 inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Follows you</p>
      ) : null}
      {!card.self && !card.blockedByMe ? <FollowButton handle={card.handle} state={card.state} className="mt-3 w-full" /> : null}
    </>
  )
}

// A link to someone's profile. With a mouse, resting on it for a moment shows a short card of the person: their picture,
// name, bio and the Follow button. On a phone or a touch screen it is the plain link.
export function ProfileLink({
  handle,
  className,
  label,
  from,
  children,
}: {
  handle: string
  className?: string
  label?: string
  // The post this link sits on, so a follow made on the profile is credited to it.
  from?: string
  children: ReactNode
}) {
  const href = from ? `/${handle}?from=${encodeURIComponent(from)}` : `/${handle}`
  const [hoverable, setHoverable] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)")
    const update = () => setHoverable(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  if (!hoverable) {
    return (
      <Link href={href} className={className} aria-label={label}>
        {children}
      </Link>
    )
  }
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger delay={350} closeDelay={150} render={<Link href={href} className={className} aria-label={label} />}>
        {children}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner side="bottom" align="start" sideOffset={8} className="z-50">
          <PreviewCard.Popup
            aria-label={`@${handle} profile preview`}
            className="w-72 rounded-[24px] border border-border bg-popover p-4 text-popover-foreground shadow-[0_26px_60px_-20px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-150 outline-none data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0"
          >
            <CardBody handle={handle} />
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  )
}
