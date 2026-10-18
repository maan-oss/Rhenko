"use client"

import { useRef, useState, type ReactNode } from "react"
import { loadMorePeople } from "@/actions/social"
import { PersonRow } from "@/components/app/person-row"
import type { PersonEntry } from "@/lib/social-rules"

// Followers or following, a page at a time. The server renders the first page, and "Show more" asks for the next one.
export function PeoplePager({
  handle,
  kind,
  viewerId,
  removable,
  initialUsers,
  initialNext,
  empty,
}: {
  handle: string
  kind: "followers" | "following"
  viewerId: string
  removable: boolean
  initialUsers: PersonEntry[]
  initialNext: number | null
  // What to show when nobody is here.
  empty: ReactNode
}) {
  const [users, setUsers] = useState(initialUsers)
  const [next, setNext] = useState(initialNext)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  // A refresh from the server brings a new first page. It replaces what is shown only when the people on it changed, so
  // following someone from the list doesn't undo a "Show more".
  const firstPage = initialUsers.map((user) => user.id).join(",")
  const [seen, setSeen] = useState(firstPage)
  if (seen !== firstPage) {
    setSeen(firstPage)
    setUsers(initialUsers)
    setNext(initialNext)
    setError(null)
  }

  async function showMore() {
    if (next === null || busy.current) return
    busy.current = true
    setLoading(true)
    setError(null)
    try {
      const result = await loadMorePeople(handle, kind, next)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setUsers((current) => {
        const have = new Set(current.map((user) => user.id))
        return [...current, ...result.users.filter((user) => !have.has(user.id))]
      })
      setNext(result.next)
    } catch {
      setError("Couldn't load more people. Check your connection and try again.")
    } finally {
      busy.current = false
      setLoading(false)
    }
  }

  if (users.length === 0 && next === null) return <>{empty}</>

  return (
    <>
      <ul>
        {users.map((user) => (
          <PersonRow
            key={user.id}
            user={user}
            viewerId={viewerId}
            removable={removable}
            onRemoved={(id) => setUsers((current) => current.filter((person) => person.id !== id))}
          />
        ))}
      </ul>
      {next !== null ? (
        <div className="flex flex-col items-center gap-2 px-4 py-5">
          <button
            type="button"
            onClick={() => void showMore()}
            disabled={loading}
            className="h-10 rounded-full border border-border px-5 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60"
          >
            {loading ? "Loading" : "Show more"}
          </button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
