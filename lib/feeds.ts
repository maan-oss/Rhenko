import { get } from "@/lib/db"
import {
  bookmarkFeed,
  circleFeed,
  hasSearchContent,
  homeFeed,
  listFeed,
  parseSearch,
  profileFeed,
  searchPostFeed,
  topicFeed,
  type Page,
  type ProfileTab,
} from "@/lib/data"
import { isFollowing } from "@/lib/post-writes"
import { memberRole } from "@/lib/circles"
import { publishDue } from "@/lib/screening"
import { withAds, type FeedEntry } from "@/lib/ads"
import { normalizeTag } from "@/lib/rules"

// A feed is described by plain data so the same spec can render on the server
// and be fetched by the client for infinite scroll.
export type FeedSpec =
  | { kind: "home"; mode: "for-you" | "following" }
  | { kind: "profile"; tab: ProfileTab; handle: string }
  | { kind: "bookmarks"; folder?: string }
  | { kind: "list"; listId: string }
  | { kind: "circle"; circleId: string }
  | { kind: "explore"; sort: "top" | "latest"; media: boolean }
  | { kind: "topic"; tag: string }
  | { kind: "search"; q: string; sort: "top" | "latest" }

const PROFILE_TABS: ProfileTab[] = ["posts", "highlights", "replies", "media", "reposts", "likes"]

const isString = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 300

export function parseSpec(input: unknown): FeedSpec | null {
  if (!input || typeof input !== "object") return null
  const spec = input as Record<string, unknown>
  switch (spec.kind) {
    case "home":
      return spec.mode === "following" || spec.mode === "for-you" ? { kind: "home", mode: spec.mode } : null
    case "profile":
      if (!isString(spec.handle) || !PROFILE_TABS.includes(spec.tab as ProfileTab)) return null
      return { kind: "profile", tab: spec.tab as ProfileTab, handle: spec.handle }
    case "bookmarks":
      if (spec.folder === undefined) return { kind: "bookmarks" }
      return isString(spec.folder) ? { kind: "bookmarks", folder: spec.folder } : null
    case "list":
      return isString(spec.listId) ? { kind: "list", listId: spec.listId } : null
    case "circle":
      return isString(spec.circleId) ? { kind: "circle", circleId: spec.circleId } : null
    case "explore":
      return { kind: "explore", sort: spec.sort === "latest" ? "latest" : "top", media: spec.media === true }
    case "topic":
      return isString(spec.tag) ? { kind: "topic", tag: normalizeTag(spec.tag) } : null
    case "search":
      if (typeof spec.q !== "string" || spec.q.length > 300) return null
      return { kind: "search", q: spec.q, sort: spec.sort === "latest" ? "latest" : "top" }
    default:
      return null
  }
}

export type FeedResult = Page<FeedEntry> & { locked?: boolean }

const EMPTY: Page<FeedEntry> = { items: [], next: null }

export function feedFor(spec: FeedSpec, viewerId: string, cursor?: string): FeedResult {
  publishDue()
  switch (spec.kind) {
    case "home":
      return withAds(homeFeed(spec.mode, viewerId, cursor), viewerId)
    case "profile": {
      const user = get<{ id: string; protected: number; deactivated_at: number | null }>(
        "SELECT id, protected, deactivated_at FROM users WHERE handle = ? COLLATE NOCASE",
        spec.handle
      )
      if (!user || user.deactivated_at !== null) return EMPTY
      if (user.id !== viewerId) {
        // Likes are listed only for the account's owner.
        if (spec.tab === "likes") return EMPTY
        const blocked = get("SELECT 1 AS found FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", viewerId, user.id, user.id, viewerId)
        if (blocked) return EMPTY
        if (user.protected === 1 && !isFollowing(viewerId, user.id)) return { ...EMPTY, locked: true }
      }
      return profileFeed(spec.tab, user.id, viewerId, cursor)
    }
    case "bookmarks":
      return bookmarkFeed(viewerId, spec.folder, cursor)
    case "list": {
      // A private list's timeline is for its owner only.
      const list = get<{ owner_id: string; private: number }>("SELECT owner_id, private FROM lists WHERE id = ?", spec.listId)
      if (!list || (list.private === 1 && list.owner_id !== viewerId)) return EMPTY
      return listFeed(spec.listId, viewerId, cursor)
    }
    case "circle": {
      // A closed circle's posts are for its members. Anyone else gets an empty feed from it.
      const circle = get<{ access: string }>("SELECT access FROM communities WHERE id = ?", spec.circleId)
      if (!circle) return EMPTY
      if (circle.access === "closed" && !memberRole(spec.circleId, viewerId)) return EMPTY
      return circleFeed(spec.circleId, viewerId, cursor)
    }
    case "explore":
      return searchPostFeed(parseSearch(spec.media ? "filter:media" : ""), spec.sort, viewerId, cursor)
    case "topic":
      return topicFeed(spec.tag, viewerId, cursor)
    case "search": {
      const query = parseSearch(spec.q)
      if (!hasSearchContent(query)) return EMPTY
      return searchPostFeed(query, spec.sort, viewerId, cursor)
    }
  }
}
