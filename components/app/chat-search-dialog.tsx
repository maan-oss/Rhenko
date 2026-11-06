"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { searchConversation, searchRowsForDevice } from "@/actions/messages"
import { LocalTime } from "@/components/app/time-text"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { searchableOf } from "@/lib/chat-export"
import { SEARCH_QUERY_MAX, searchHitsOf, type SearchableMessage } from "@/lib/chat-message-rules"
import type { ChatSearchHit } from "@/lib/data"
import { openRows } from "@/lib/e2ee-client"
import { cn } from "@/lib/utils"

// Quiet time after the last key before a search runs, so each word doesn't send its own request.
const SEARCH_DELAY_MS = 250
// The most hits one search shows, the same as the server's search.
const HITS_MAX = 50

type Found = { ok: true; hits: ChatSearchHit[] } | { ok: false; error: string }

// Searches the words of one chat. A hit opens the thread at that message, with the messages after it. Only the newest answer
// is shown, so a slow earlier search can't replace a later one. An encrypted chat is searched on this device, where its messages open.
export function ChatSearchDialog({
  conversationId,
  encrypted,
  onOpenChange,
}: {
  conversationId: string
  encrypted: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  // The chat's messages as this device reads them, loaded once when an encrypted chat is first searched.
  const loaded = useRef<Promise<SearchableMessage[]> | null>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  // The newest answer, with the words it was asked for, so an answer to older words is never shown for newer ones.
  const [answer, setAnswer] = useState<{ query: string; hits: ChatSearchHit[]; error: string | null } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // The words of an encrypted chat, found on this device. The messages are opened once and kept for the rest of the search.
  function searchOnDevice(query: string): Promise<Found> {
    if (!loaded.current) {
      loaded.current = searchRowsForDevice(conversationId).then(async (result) => {
        if (!result.ok) throw new Error(result.error)
        const opened = await openRows(conversationId, result.rows)
        return result.rows.flatMap((row) => {
          const message = searchableOf(row, opened[row.id])
          return message ? [message] : []
        })
      })
      loaded.current.catch(() => {
        loaded.current = null
      })
    }
    return loaded.current.then((messages) => ({ ok: true as const, hits: searchHitsOf(messages, query, HITS_MAX) }))
  }

  function change(value: string) {
    setText(value)
    window.clearTimeout(timer.current)
    const query = value.replace(/\s+/g, " ").trim()
    const run = latest.current + 1
    latest.current = run
    if (query.length === 0) {
      setBusy(false)
      setAnswer(null)
      return
    }
    setBusy(true)
    timer.current = window.setTimeout(() => {
      const found: Promise<Found> = encrypted ? searchOnDevice(query) : searchConversation(conversationId, query)
      found
        .then((result) => {
          if (latest.current !== run) return
          setBusy(false)
          setAnswer(result.ok ? { query, hits: result.hits, error: null } : { query, hits: [], error: result.error })
        })
        .catch(() => {
          if (latest.current !== run) return
          setBusy(false)
          setAnswer({ query, hits: [], error: "Couldn't search right now. Try again." })
        })
    }, SEARCH_DELAY_MS)
  }

  function open(id: string) {
    onOpenChange(false)
    router.push(`/messages/${conversationId}?m=${encodeURIComponent(id)}`)
  }

  const query = text.replace(/\s+/g, " ").trim()

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle>Search this chat</DialogTitle>
        <DialogDescription>
          Finds the words in messages here. Your own and theirs, newest first.
          {encrypted ? " Encrypted messages are searched on this device." : null}
        </DialogDescription>
        <label className="mt-2 flex items-center gap-2 rounded-full border border-border bg-background px-4 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search words in this chat</span>
          <input
            type="search"
            autoFocus
            value={text}
            maxLength={SEARCH_QUERY_MAX}
            onChange={(event) => change(event.target.value)}
            placeholder="Search this chat"
            className="tap-44 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div aria-live="polite" className="mt-3 max-h-[55dvh] min-h-24 overflow-y-auto">
          {query.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Type a word or two to find it in this chat.</p>
          ) : answer === null || answer.query !== query ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{busy ? "Searching…" : "Type a word or two to find it in this chat."}</p>
          ) : answer.error ? (
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              {answer.error}
            </p>
          ) : answer.hits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No messages here match &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="list-none">
              {answer.hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => open(hit.id)}
                    className="tap-44 flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                  >
                    <span className="flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
                      <span className="truncate font-semibold text-foreground">{hit.mine ? "You" : hit.senderName}</span>
                      <span className="shrink-0 tabular-nums">
                        <LocalTime at={hit.createdAt} variant="day" />
                      </span>
                    </span>
                    <span className="line-clamp-2 break-words text-[14px] leading-snug">
                      {hit.before}
                      <mark className="rounded-sm bg-foreground/15 px-0.5 text-foreground">{hit.match}</mark>
                      {hit.after}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
