"use client"

import Link from "@/components/app/link"
import { useEffect, useState, type ReactNode } from "react"
import { CircleHelp, X } from "lucide-react"
import { boostSetup } from "@/actions/ads"
import { BoostForm } from "@/components/app/boost-form"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { BoostSetup } from "@/lib/boost-setup"

type Loader = (postId: string) => Promise<BoostSetup>

const PILL_LINK =
  "inline-flex h-12 items-center rounded-full border border-border px-6 text-[15px] font-semibold transition-colors duration-200 hover:bg-muted"

// Boost a post from the post's menu. On a phone it rises from the bottom edge, flush with the screen, as X's does. On a computer it
// is a dialog in the middle of the screen. It loads what the boost would be each time it opens, so the balance and the views it
// buys are current.
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[400px] max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-t-[32px] max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom)] max-sm:data-open:zoom-in-100 max-sm:data-closed:zoom-out-100"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-2">
          <DialogClose
            aria-label="Close"
            render={<Button variant="ghost" size="icon" className="size-10 text-foreground" />}
          >
            <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </DialogClose>
          <DialogTitle className="text-[17px] font-semibold">Boost post</DialogTitle>
          <Link
            href="/transparency/ads#boosts"
            aria-label="How boosts work"
            className="grid size-10 place-items-center rounded-full text-foreground transition-colors duration-200 hover:bg-muted"
          >
            <CircleHelp className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <BoostBody setup={setup} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// What a boost shows: the budget choice, or the one reason the post cannot be boosted.
export function BoostBody({ setup }: { setup: BoostSetup | null }) {
  if (setup === null) {
    return (
      <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-4 px-4 pt-2 pb-4">
        <div className="h-[280px] animate-pulse rounded-2xl bg-muted" />
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
        <div className="h-14 animate-pulse rounded-full bg-muted" />
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

  return <BoostForm postId={setup.postId} options={setup.options} currency={setup.currency} balance={setup.balance} />
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-center gap-4 px-6 py-8 text-center text-[15px] text-pretty">{children}</div>
}
