"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { dismissSuggestion } from "@/actions/connections"
import { Avatar } from "@/components/app/avatar"
import { FollowButton } from "@/components/app/follow-button"
import type { SuggestedPerson } from "@/lib/connections"

// One suggested person. The reason is on the card, so nobody wonders why they are here. "Not now" removes the card and
// keeps that person out of this viewer's suggestions. The compact card is for the setup steps: one reason, no Message.
export function ConnectionCard({ person, compact = false }: { person: SuggestedPerson; compact?: boolean }) {
  const [hidden, setHidden] = useState(false)
  const [pending, startTransition] = useTransition()
  if (hidden) return null
  const [first, second] = person.reasons
  return (
    <li className="group flex items-start gap-3.5 px-4 py-4 transition-colors duration-200 hover:bg-foreground/[0.025]">
      <Link href={`/${person.handle}`} className="shrink-0" aria-label={`${person.name}, @${person.handle}`}>
        <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={44} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/${person.handle}`} className="min-w-0">
            <span className="block truncate text-[15px] font-semibold">{person.name}</span>
            <span className="block truncate text-[14px] text-muted-foreground">@{person.handle}</span>
          </Link>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await dismissSuggestion(person.id)
                if (result.ok) setHidden(true)
              })
            }
            className="tap-44 -mt-1 -mr-2 inline-flex h-8 shrink-0 items-center rounded-full px-2.5 text-[14px] font-medium text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
          >
            Not now
          </button>
        </div>
        {!compact && person.bio ? <p className="line-clamp-2 text-[14px] leading-relaxed">{person.bio}</p> : null}
        {first ? <p className="text-[13px] leading-relaxed text-foreground/80">{first}</p> : null}
        {!compact && second ? <p className="text-[13px] leading-relaxed text-muted-foreground">{second}</p> : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FollowButton handle={person.handle} state="none" />
          {compact ? null : (
            <Link
              href={`/messages/new?with=${encodeURIComponent(person.handle)}`}
              className="tap-44 inline-flex h-9 items-center rounded-full border border-border px-4 text-[14px] font-semibold transition-colors duration-200 hover:border-foreground/30 hover:bg-foreground/5"
            >
              Message
            </Link>
          )}
        </div>
      </div>
    </li>
  )
}
