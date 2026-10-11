"use client"

import { useEffect, useOptimistic, useTransition } from "react"
import Link from "next/link"
import { Clock, X } from "lucide-react"
import { clearSearches, forgetSearch, rememberSearch } from "@/actions/search"

// Saves a search to the account's history when it is shown.
export function RememberSearch({ query }: { query: string }) {
  useEffect(() => {
    void rememberSearch(query)
  }, [query])
  return null
}

// The searches an account ran most recently, with a way to remove one or all of them.
export function RecentSearches({ queries }: { queries: string[] }) {
  const [visible, removeOptimistic] = useOptimistic(queries, (current, removed: string | "*") =>
    removed === "*" ? [] : current.filter((query) => query !== removed)
  )
  const [, startTransition] = useTransition()

  if (visible.length === 0) return null

  return (
    <section aria-labelledby="recent-searches" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 id="recent-searches" className="text-sm font-semibold">
          Recent searches
        </h2>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              removeOptimistic("*")
              await clearSearches()
            })
          }
          className="text-sm text-dusk hover:underline"
        >
          Clear all
        </button>
      </div>
      <ul className="flex flex-col">
        {visible.map((query) => (
          <li key={query} className="flex items-center gap-2 border-b border-border">
            <Clock className="size-4 shrink-0 text-muted-foreground" />
            <Link href={`/search?q=${encodeURIComponent(query)}`} className="min-w-0 flex-1 truncate py-3 text-[15px] hover:underline">
              {query}
            </Link>
            <button
              type="button"
              aria-label={`Remove “${query}” from recent searches`}
              onClick={() =>
                startTransition(async () => {
                  removeOptimistic(query)
                  await forgetSearch(query)
                })
              }
              className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
