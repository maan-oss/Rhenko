"use client"

import { useOptimistic, useState, useTransition } from "react"
import Link from "next/link"
import { Bookmark, X } from "lucide-react"
import { saveSearch, unsaveSearch } from "@/actions/search"

// Keeps a search in the account, or takes it out. The button shows the change at once; if the server refuses, it
// says why and goes back.
export function SaveSearchButton({ query, saved }: { query: string; saved: boolean }) {
  const [state, setState] = useOptimistic(saved, (_current, next: boolean) => next)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-pressed={state}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            setState(!state)
            if (state) {
              await unsaveSearch(query)
              return
            }
            const result = await saveSearch(query)
            if (!result.ok) {
              setError(result.error)
              setState(false)
            }
          })
        }
        className="tap-44 inline-flex h-9 items-center gap-2 rounded-full border border-border px-3.5 text-sm font-semibold transition-colors hover:bg-foreground/5"
      >
        <Bookmark className={state ? "size-4 fill-current" : "size-4"} aria-hidden="true" />
        {state ? "Saved" : "Save search"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// The searches an account kept, with a way to remove each one.
export function SavedSearches({ queries }: { queries: string[] }) {
  const [visible, removeOptimistic] = useOptimistic(queries, (current, removed: string) => current.filter((query) => query !== removed))
  const [, startTransition] = useTransition()

  if (visible.length === 0) return null

  return (
    <section aria-labelledby="saved-searches" className="flex flex-col gap-1">
      <h2 id="saved-searches" className="text-sm font-semibold">
        Saved searches
      </h2>
      <ul className="flex flex-col">
        {visible.map((query) => (
          <li key={query} className="flex items-center gap-2 border-b border-border">
            <Bookmark className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Link href={`/search?q=${encodeURIComponent(query)}`} className="min-w-0 flex-1 truncate py-3 text-[15px] hover:underline">
              {query}
            </Link>
            <button
              type="button"
              aria-label={`Remove “${query}” from saved searches`}
              onClick={() =>
                startTransition(async () => {
                  removeOptimistic(query)
                  await unsaveSearch(query)
                })
              }
              className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted sm:size-8"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
