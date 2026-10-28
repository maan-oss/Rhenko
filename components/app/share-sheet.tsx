"use client"

import { useEffect, useState, useTransition, type ReactNode } from "react"
import Link from "@/components/app/link"
import { motion } from "motion/react"
import { Check, Code2, Link2, Search, Send, Share2, X, type LucideIcon } from "lucide-react"
import { toast } from "sonner"
import { sharePostWith, shareRecipients } from "@/actions/messages"
import { Avatar } from "@/components/app/avatar"
import { BottomSheet } from "@/components/app/bottom-sheet"
import { DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { MiniUser } from "@/lib/data"
import { MAX_DM } from "@/lib/rules"
import { useIsDesktop } from "@/lib/use-media"
import { cn } from "@/lib/utils"

export type SharePost = {
  id: string
  body: string
  author: { name: string; handle: string; avatarFile: string | null }
}

const EXCERPT_MAX = 140
const RECIPIENT_MAX = 10

// Sharing a post: a computer opens it as a dialog, a phone as a sheet from the bottom. Either way you pick the people
// (recent chats first, or a search), add an optional note, and send. The same sheet copies the link or embeds the post.
export function ShareSheet({ open, onOpenChange, post }: { open: boolean; onOpenChange: (open: boolean) => void; post: SharePost }) {
  const desktop = useIsDesktop()
  const close = () => onOpenChange(false)
  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton className={cn("gap-0 overflow-hidden rounded-[28px] p-0 sm:max-w-[440px]", DIALOG_FIT)}>
          <DialogTitle className="sr-only">Share post</DialogTitle>
          <ShareBody post={post} onDone={close} />
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <BottomSheet open={open} onClose={close} label="Share post">
      <ShareBody post={post} onDone={close} />
    </BottomSheet>
  )
}

function excerptOf(body: string): string {
  const text = body.replace(/\s+/g, " ").trim()
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text
}

function linkOf(post: SharePost): string {
  return `${window.location.origin}/${post.author.handle}/status/${post.id}`
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

// The embed is pasted into other people's pages, which have none of this app's CSS, so every look it has is written into
// the snippet itself: the card (border, radius, padding, background, text), the type, and the link. It carries colours of
// its own, so it reads the same on a light or a dark page, and it sets the few text styles a page's own blockquote rule
// would otherwise bend. It holds no class, no script and no image.
const EMBED_CARD = [
  "margin:16px 0",
  "padding:16px 18px",
  "max-width:550px",
  "box-sizing:border-box",
  "border:1px solid #e5e5e5",
  "border-radius:16px",
  "background:#fafafa",
  "color:#0a0a0a",
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  "font-size:16px",
  "font-style:normal",
  "font-weight:400",
  "line-height:1.5",
  "text-align:left",
  "quotes:none",
].join(";")
const EMBED_TEXT = "margin:0 0 12px;white-space:pre-line;overflow-wrap:anywhere"
const EMBED_BYLINE = "margin:0;font-size:14px;line-height:1.4;color:#5f5f5f"
const EMBED_LINK = "color:#0a0a0a;font-weight:600;text-decoration:underline"

function embedCode(post: SharePost, link: string): string {
  const text = post.body.trim()
  return [
    `<blockquote style="${EMBED_CARD};">`,
    ...(text ? [`  <p style="${EMBED_TEXT};">${escapeHtml(text)}</p>`] : []),
    `  <p style="${EMBED_BYLINE};">&mdash; ${escapeHtml(post.author.name)} (@${escapeHtml(post.author.handle)}) <a href="${escapeHtml(link)}" style="${EMBED_LINK};">View on Rhenko</a></p>`,
    `</blockquote>`,
  ].join("\n")
}

type Sent = { handles: string[]; conversationId: string | null; failed: { handle: string; error: string }[] }

function ShareBody({ post, onDone }: { post: SharePost; onDone: () => void }) {
  const [query, setQuery] = useState("")
  const [people, setPeople] = useState<MiniUser[] | null>(null)
  const [selected, setSelected] = useState<MiniUser[]>([])
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<Sent | null>(null)
  const [copied, setCopied] = useState<"link" | "embed" | null>(null)
  const [sending, startSending] = useTransition()

  // Recent chats first. Typing searches everyone who can be reached, a moment after the last key.
  useEffect(() => {
    let current = true
    const timer = window.setTimeout(
      () => {
        shareRecipients(query)
          .then((found) => {
            if (current) setPeople(found)
          })
          .catch(() => {
            if (current) setPeople([])
          })
      },
      query ? 180 : 0
    )
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [query])

  // The tile that was copied says "Copied" for a moment.
  useEffect(() => {
    if (copied === null) return
    const timer = window.setTimeout(() => setCopied(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  function toggle(person: MiniUser) {
    setSelected((list) => {
      if (list.some((p) => p.handle === person.handle)) return list.filter((p) => p.handle !== person.handle)
      return list.length < RECIPIENT_MAX ? [...list, person] : list
    })
  }

  function send() {
    setError(null)
    startSending(async () => {
      const result = await sharePostWith(
        post.id,
        selected.map((p) => p.handle),
        note
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.sent.length === 0) {
        setError(result.failed[0]?.error ?? "Couldn't send this post.")
        return
      }
      setSent({
        handles: result.sent.map((s) => s.handle),
        conversationId: result.sent.length === 1 ? result.sent[0].conversationId : null,
        failed: result.failed,
      })
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(linkOf(post))
      setCopied("link")
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedCode(post, linkOf(post)))
      setCopied("embed")
    } catch {
      toast.error("Couldn't copy the embed code.")
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: `${post.author.name} on Rhenko`, text: excerptOf(post.body), url: linkOf(post) })
    } catch {
      // Closing the system sheet is not an error.
    }
  }

  if (sent) return <SentView sent={sent} onDone={onDone} />

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function"
  const excerpt = excerptOf(post.body)
  const label =
    selected.length === 0
      ? "Choose who to send it to"
      : selected.length === 1
        ? `Send to ${selected[0].name}`
        : `Send to ${selected.length} people`

  return (
    <div className="flex flex-col pb-2">
      <div className="px-5 pt-5 pb-4">
        <p className="text-[19px] font-semibold tracking-tight">Share post</p>
      </div>

      <div className="mx-5 flex gap-3 rounded-[20px] border border-border bg-background/70 p-3.5">
        <Avatar user={{ id: post.id, name: post.author.name, avatarFile: post.author.avatarFile }} size={34} />
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">
            {post.author.name} <span className="font-normal text-muted-foreground">@{post.author.handle}</span>
          </p>
          {excerpt ? <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug text-foreground/80">{excerpt}</p> : null}
        </div>
      </div>

      <div className="px-5 pt-4">
        <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-[18px] border border-input bg-background px-2.5 py-1.5 transition-colors focus-within:border-foreground/50">
          {selected.map((person) => (
            <span key={person.handle} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1 pl-1 max-sm:h-10 max-sm:py-0 max-sm:pl-1.5 max-sm:pr-0">
              <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={22} />
              <span className="max-w-[9rem] truncate text-[13px] font-medium">{person.name}</span>
              <button
                type="button"
                onClick={() => toggle(person)}
                aria-label={`Remove ${person.name}`}
                className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground max-sm:size-10"
              >
                <X className="size-3" strokeWidth={2.4} aria-hidden="true" />
              </button>
            </span>
          ))}
          <label className="flex min-w-[140px] flex-1 items-center gap-2 pl-1">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={selected.length ? "Add more people" : "Search people"}
              aria-label="Search people"
              autoComplete="off"
              className="h-8 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground max-sm:h-10"
            />
          </label>
        </div>

        <ul className="mt-2 max-h-[260px] overflow-y-auto overscroll-contain">
          {people === null ? <li className="px-2.5 py-3 text-[14px] text-muted-foreground">Loading people…</li> : null}
          {people !== null && people.length === 0 ? (
            <li className="px-2.5 py-3 text-[14px] text-muted-foreground">
              {query ? "No one matches that search." : "Your recent chats show up here."}
            </li>
          ) : null}
          {people?.map((person) => {
            const picked = selected.some((p) => p.handle === person.handle)
            return (
              <li key={person.handle}>
                <button
                  type="button"
                  aria-pressed={picked}
                  onClick={() => toggle(person)}
                  className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar user={{ id: person.id, name: person.name, avatarFile: person.avatarFile }} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{person.name}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">@{person.handle}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-full border transition-colors duration-200",
                      picked ? "border-foreground bg-foreground text-background" : "border-input"
                    )}
                  >
                    {picked ? <Check className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_DM}
          placeholder="Add a note (optional)"
          aria-label="Note"
          className="mt-3 h-11 w-full rounded-[18px] border border-input bg-background px-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/50"
        />

        {error ? (
          <p role="alert" className="pt-3 text-[14px] text-destructive">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={send}
          disabled={selected.length === 0 || sending}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-semibold text-background transition-[opacity,transform] duration-200 hover:opacity-90 active:opacity-80 disabled:opacity-50"
        >
          <Send className="size-[17px]" strokeWidth={2.2} aria-hidden="true" />
          {sending ? "Sending…" : label}
        </button>
      </div>

      <div className={cn("mt-5 grid gap-2 border-t border-border px-5 pt-4", canNativeShare ? "grid-cols-3" : "grid-cols-2")}>
        <ActionTile icon={copied === "link" ? Check : Link2} label={copied === "link" ? "Copied" : "Copy link"} onClick={copyLink} />
        {canNativeShare ? <ActionTile icon={Share2} label="Share…" onClick={nativeShare} /> : null}
        <ActionTile icon={copied === "embed" ? Check : Code2} label={copied === "embed" ? "Copied" : "Copy embed code"} onClick={copyEmbed} />
      </div>
    </div>
  )
}

function ActionTile({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-[18px] px-1 py-3 text-center text-[13px] leading-tight font-medium transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-11 place-items-center rounded-full bg-muted">
        <Icon className="size-[19px]" strokeWidth={2} aria-hidden="true" />
      </span>
      {label}
    </button>
  )
}

// What happened after sending: a check that settles in, who it went to, and where to go next.
function SentView({ sent, onDone }: { sent: Sent; onDone: () => void }) {
  const names = sent.handles.map((h) => `@${h}`).join(", ")
  const failed: ReactNode =
    sent.failed.length > 0 ? (
      <p className="mt-3 text-[14px] text-destructive">
        Couldn&apos;t send to {sent.failed.map((f) => `@${f.handle}`).join(", ")}. {sent.failed[0].error}
      </p>
    ) : null
  return (
    <div className="flex flex-col items-center px-6 pt-9 pb-7 text-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 20 }}
        className="grid size-16 place-items-center rounded-full bg-foreground text-background"
      >
        <Check className="size-8" strokeWidth={2.4} aria-hidden="true" />
      </motion.span>
      <p className="mt-5 text-[21px] font-semibold tracking-tight">Sent</p>
      <p className="mt-1.5 text-[15px] text-muted-foreground">It went to {names}.</p>
      {failed}
      <div className="mt-7 flex w-full gap-2">
        <button
          type="button"
          onClick={onDone}
          className="h-12 flex-1 rounded-full border border-border text-[15px] font-semibold transition-colors hover:bg-foreground/5"
        >
          Done
        </button>
        <Link
          href={sent.conversationId ? `/messages/${sent.conversationId}` : "/messages"}
          onClick={onDone}
          className="grid h-12 flex-1 place-items-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-90"
        >
          {sent.conversationId ? "Open chat" : "Open messages"}
        </Link>
      </div>
    </div>
  )
}
