"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import { chatInfo, setConversationAlerts, type ChatInfoResult } from "@/actions/messages"
import { Avatar } from "@/components/app/avatar"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import type { AlertLevel } from "@/lib/chat-message-rules"
import { cn } from "@/lib/utils"

type Info = Extract<ChatInfoResult, { ok: true }>

const LEVELS: { level: AlertLevel; label: string; hint: string }[] = [
  { level: "all", label: "All messages", hint: "Every new message" },
  { level: "mentions", label: "Mentions only", hint: "Only when someone mentions you" },
  { level: "none", label: "Nothing", hint: "No notifications from this chat" },
]

// Who is in a chat, what has been shared in it, and how its notifications reach this person. Nothing here is shown to anyone else.
export function ContactInfoDialog({ conversationId, onOpenChange }: { conversationId: string; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<ChatInfoResult | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let current = true
    chatInfo(conversationId)
      .then((result) => {
        if (current) setInfo(result)
      })
      .catch(() => {
        if (current) setInfo({ ok: false, error: "Couldn't load this right now. Try again." })
      })
    return () => {
      current = false
    }
  }, [conversationId])

  function choose(level: AlertLevel, loaded: Info) {
    const previous = loaded.level
    setInfo({ ...loaded, level })
    startTransition(async () => {
      const result = await setConversationAlerts(conversationId, level)
      if (!result.ok) {
        setInfo({ ...loaded, level: previous })
        toast.error(result.error)
      }
    })
  }

  const loaded = info?.ok ? info : null
  const isGroup = loaded?.kind === "group"
  const title = isGroup ? "Group info" : "Contact info"

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle>{title}</DialogTitle>
        {info === null ? (
          <DialogDescription>Loading…</DialogDescription>
        ) : !info.ok ? (
          <DialogDescription role="alert" className="text-destructive">
            {info.error}
          </DialogDescription>
        ) : (
          <div className="flex max-h-[70dvh] flex-col gap-5 overflow-y-auto pt-1">
            {isGroup ? (
              <section aria-labelledby="chat-people">
                <h3 id="chat-people" className="text-sm font-semibold text-muted-foreground">
                  {info.people.length + 1} {info.people.length === 0 ? "person" : "people"}
                </h3>
                <ul className="mt-2 flex list-none flex-col gap-1">
                  {info.people.map((person) => (
                    <li key={person.id}>
                      <Link href={`/${person.handle}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50">
                        <Avatar user={person} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold">{person.name}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">@{person.handle}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : info.people[0] ? (
              <Link href={`/${info.people[0].handle}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/50">
                <Avatar user={info.people[0]} size={56} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-semibold">{info.people[0].name}</span>
                  <span className="block truncate text-[14px] text-muted-foreground">@{info.people[0].handle}</span>
                </span>
              </Link>
            ) : null}

            <section aria-labelledby="chat-shared">
              <h3 id="chat-shared" className="text-sm font-semibold text-muted-foreground">
                Shared in this chat
              </h3>
              <dl className="mt-2 divide-y divide-border rounded-xl border border-border">
                <Count label="Photos and videos" value={info.counts.media} />
                <Count label="Files" value={info.counts.documents} />
                <Count label="Links" value={info.counts.links} />
                <Count label="Starred messages" value={info.counts.starred} />
              </dl>
            </section>

            <section aria-labelledby="chat-alerts">
              <h3 id="chat-alerts" className="text-sm font-semibold text-muted-foreground">
                Notifications
              </h3>
              <div role="radiogroup" aria-labelledby="chat-alerts" className="mt-2 flex flex-col gap-1">
                {LEVELS.map((option) => {
                  const selected = loaded?.level === option.level
                  return (
                    <button
                      key={option.level}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={pending && !selected}
                      onClick={() => loaded && choose(option.level, loaded)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring outline-none",
                        selected && "bg-muted/60"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-foreground" : "border-border")}
                      >
                        {selected ? <span className="size-2.5 rounded-full bg-foreground" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">{option.label}</span>
                        <span className="block text-[13px] text-muted-foreground">{option.hint}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-[15px]">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
    </div>
  )
}
