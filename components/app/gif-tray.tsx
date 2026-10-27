"use client"

import { useEffect, useId, useRef, useState } from "react"
import { LoaderCircle, Search } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { toast } from "sonner"
import { useGifSetup } from "@/components/app/gif-setup"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { MAX_GIF_QUERY, type Gif } from "@/lib/gifs"

// The GIF panel: a search field, trending GIFs while it is empty, and a grid. Choosing one asks the server for the file and
// hands it to the composer, which attaches it like a photo from the device. The browser only ever talks to this server: the
// search, the pictures in the grid and the chosen file all come through /api/gifs (see lib/gifs.ts).

type Page = { key: string; gifs: Gif[]; next: string | null; error: string | null }
type Reply = { gifs: Gif[]; next: string | null } | { error: string }

const TYPING_PAUSE_MS = 350
const TROUBLE = "GIFs couldn't be loaded. Try again."
const OFFLINE = "Couldn't reach GIF search. Check your connection, then try again."
const SKELETON_SHAPES = [1, 0.75, 1.35, 1, 1.6, 0.8]

// Wide and tall GIFs are held to a shape the grid can lay out; the picture fills its tile.
function shapeOf(gif: Gif): string {
  return String(Math.min(Math.max(gif.width / gif.height, 0.5), 2.2))
}

function fileStem(gif: Gif): string {
  const stem = gif.id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40)
  return `gif-${stem || "pick"}`
}

function repliedWith(data: unknown): data is { gifs: Gif[]; next: string | null } {
  return typeof data === "object" && data !== null && "gifs" in data && Array.isArray((data as { gifs: unknown }).gifs)
}

function errorOf(data: unknown): string {
  return typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string" ? (data as { error: string }).error : TROUBLE
}

async function ask(params: URLSearchParams, signal?: AbortSignal): Promise<{ ok: true; page: { gifs: Gif[]; next: string | null } } | { ok: false; error: string }> {
  const response = await fetch(`/api/gifs?${params}`, { signal })
  const data: Reply | null = await response.json().catch(() => null)
  return response.ok && repliedWith(data) ? { ok: true, page: data } : { ok: false, error: errorOf(data) }
}

const TEXT_BUTTON =
  "inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-semibold transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"

export function GifTray({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onPick: (file: File) => void }) {
  const setup = useGifSetup()
  const reduce = useReducedMotion()
  const searchId = useId()
  const gridRef = useRef<HTMLUListElement>(null)
  // What is typed, and the search the grid is showing. The second follows the first when typing pauses or Enter is pressed.
  const [text, setText] = useState("")
  const [query, setQuery] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState<Page | null>(null)
  const [more, setMore] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  // False once the panel has closed, so a pick that was still downloading is dropped instead of attaching later.
  const alive = useRef(true)

  const typed = text.replace(/\s+/g, " ").trim()

  useEffect(() => {
    if (typed === query) return
    const timer = window.setTimeout(() => setQuery(typed), TYPING_PAUSE_MS)
    return () => window.clearTimeout(timer)
  }, [typed, query])

  // Loads trending, or the search. The grid is "loading" for as long as the page it holds is not for the current search.
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (query !== "") params.set("q", query)
    ask(params, controller.signal)
      .then((result) => setPage(result.ok ? { key: query, ...result.page, error: null } : { key: query, gifs: [], next: null, error: result.error }))
      .catch(() => {
        if (!controller.signal.aborted) setPage({ key: query, gifs: [], next: null, error: OFFLINE })
      })
    return () => controller.abort()
  }, [query, attempt])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const loading = page === null || page.key !== query
  const gifs = loading ? [] : page.gifs

  async function showMore() {
    if (loading || !page.next || more) return
    const { key, next } = page
    const params = new URLSearchParams({ next })
    if (key !== "") params.set("q", key)
    setMore(true)
    try {
      const result = await ask(params)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setPage((current) => {
        if (!current || current.key !== key) return current
        const seen = new Set(current.gifs.map((gif) => gif.id))
        return { ...current, gifs: [...current.gifs, ...result.page.gifs.filter((gif) => !seen.has(gif.id))], next: result.page.next }
      })
    } catch {
      toast.error(OFFLINE)
    } finally {
      setMore(false)
    }
  }

  async function choose(gif: Gif) {
    if (picking !== null) return
    setPicking(gif.id)
    try {
      const response = await fetch("/api/gifs/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gif.id }),
      })
      if (!response.ok) {
        const problem = errorOf(await response.json().catch(() => null))
        if (alive.current) toast.error(problem)
        return
      }
      const blob = await response.blob()
      if (!alive.current) return
      onPick(new File([blob], `${fileStem(gif)}.gif`, { type: "image/gif" }))
      onOpenChange(false)
    } catch {
      if (alive.current) toast.error(OFFLINE)
    } finally {
      if (alive.current) setPicking(null)
    }
  }

  const placeholder = setup.enabled ? setup.placeholder : "Search GIFs"
  const status = loading
    ? "Loading GIFs"
    : page.error
      ? page.error
      : gifs.length === 0
        ? `No GIFs found for ${query}`
        : `${gifs.length} GIFs${query ? ` for ${query}` : ", trending now"}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,460px)] gap-3 p-5" showCloseButton>
        <DialogTitle className="text-lg font-semibold">Add a GIF</DialogTitle>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(typed)
          }}
        >
          <label htmlFor={searchId} className="sr-only">
            Search GIFs
          </label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={searchId}
              type="search"
              value={text}
              maxLength={MAX_GIF_QUERY}
              placeholder={placeholder}
              autoComplete="off"
              enterKeyHint="search"
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  gridRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus()
                }
              }}
              className="h-11 rounded-full bg-muted pr-4 pl-10 focus-visible:bg-background md:text-[15px]"
            />
          </div>
        </form>
        <p role="status" className="sr-only">
          {status}
        </p>

        <div className="-mx-1 max-h-[min(52dvh,420px)] min-h-32 overflow-y-auto overscroll-contain px-1" aria-busy={loading}>
          {loading ? (
            <div aria-hidden="true" className="columns-2 gap-1.5 sm:columns-3">
              {SKELETON_SHAPES.map((shape, index) => (
                <Skeleton key={index} className="mb-1.5 w-full rounded-xl break-inside-avoid" style={{ aspectRatio: String(shape) }} />
              ))}
            </div>
          ) : page.error ? (
            <div className="grid place-items-center gap-3 py-8 text-center">
              <p className="max-w-[28ch] text-sm text-muted-foreground">{page.error}</p>
              <button
                type="button"
                onClick={() => {
                  setPage(null)
                  setAttempt((value) => value + 1)
                }}
                className={TEXT_BUTTON}
              >
                Try again
              </button>
            </div>
          ) : gifs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No GIFs for &ldquo;{query}&rdquo;. Try another word.</p>
          ) : (
            <>
              <ul ref={gridRef} aria-label={query ? `GIFs for ${query}` : "Trending GIFs"} className="columns-2 gap-1.5 sm:columns-3">
                {gifs.map((gif) => (
                  <li key={gif.id} className="mb-1.5 break-inside-avoid">
                    <button
                      type="button"
                      onClick={() => void choose(gif)}
                      disabled={picking !== null && picking !== gif.id}
                      aria-label={`Add GIF: ${gif.title}`}
                      aria-busy={picking === gif.id}
                      style={{ aspectRatio: shapeOf(gif) }}
                      className="relative block w-full overflow-hidden rounded-xl bg-muted outline-none transition-[opacity,transform] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover active:scale-[0.98] disabled:opacity-50"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={reduce ? gif.still : gif.preview} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
                      {picking === gif.id ? (
                        <span className="absolute inset-0 grid place-items-center bg-background/60">
                          <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              {page.next ? (
                <div className="flex justify-center pt-1.5 pb-1">
                  <button type="button" onClick={() => void showMore()} disabled={more || picking !== null} className={TEXT_BUTTON}>
                    {more ? "Loading" : "Show more"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        {setup.enabled ? (
          <p className="border-t border-border pt-3 text-[12px] leading-snug text-muted-foreground">{setup.poweredBy}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
