"use client"

import Link from "@/components/app/link"
import { useEffect, useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { boostSetup } from "@/actions/ads"
import { BottomSheet } from "@/components/app/bottom-sheet"
import { BoostForm } from "@/components/app/boost-form"
import type { BoostSetup } from "@/lib/boost-setup"

type Loader = (postId: string) => Promise<BoostSetup>

const PILL_LINK =
  "inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-semibold transition-colors duration-200 hover:bg-muted"

// Boost a post from a sheet that rises over it, as X does. It loads what the boost would be each time it opens, so the
// balance and the views it buys are current.
export function BoostSheet({
  postId,
  open,
  onClose,
  load = boostSetup,
}: {
  postId: string
  open: boolean
  onClose: () => void
  load?: Loader
}) {
  const [setup, setSetup] = useState<BoostSetup | null>(null)

  useEffect(() => {
    if (!open) return
    let current = true
    load(postId)
      .then((result) => {
        if (current) setSetup(result)
      })
      .catch(() => {
        if (current) setSetup({ kind: "missing" })
      })
    return () => {
      current = false
    }
  }, [open, postId, load])

  return (
    <BottomSheet open={open} onClose={onClose} label="Boost post" rest="86dvh">
      <div className="relative flex h-14 items-center justify-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </button>
        <h2 className="text-[17px] font-semibold">Boost post</h2>
      </div>
      <BoostSheetBody setup={setup} />
    </BottomSheet>
  )
}

// What the sheet shows: the post as its ad will look and the budget choice, or the one reason the post cannot be boosted.
export function BoostSheetBody({ setup }: { setup: BoostSetup | null }) {
  if (setup === null) {
    return (
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-2 px-4 pb-4">
        <div className="h-[72px] animate-pulse rounded-2xl bg-muted" />
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="mt-2 h-14 animate-pulse rounded-full bg-muted" />
      </div>
    )
  }

  if (setup.kind === "missing") return <Notice>This post is not available.</Notice>

  if (setup.kind === "boosted") {
    return (
      <Notice>
        <p>This post is already boosted.</p>
        <Link href={`/advertise/campaigns/${setup.campaignId}`} className={PILL_LINK}>
          See this boost
        </Link>
      </Notice>
    )
  }

  if (setup.kind === "blocked") {
    return (
      <Notice>
        <p>{setup.message}</p>
        {setup.needsAccount ? (
          <Link href="/advertise" className={PILL_LINK}>
            Set up advertising
          </Link>
        ) : null}
      </Notice>
    )
  }

  return (
    <>
      <div className="px-4 pb-4">
        <div className="rounded-2xl bg-muted px-4 py-3">
          <p className="text-[12px] font-semibold text-muted-foreground">Ad · {setup.ad.advertiser}</p>
          <p className="mt-1 line-clamp-3 text-[15px] leading-snug break-words whitespace-pre-line">{setup.ad.body}</p>
        </div>
      </div>
      <BoostForm postId={setup.postId} options={setup.options} currency={setup.currency} balance={setup.balance} />
    </>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-4 px-6 pt-4 pb-6 text-center text-[15px] text-pretty">{children}</div>
}
