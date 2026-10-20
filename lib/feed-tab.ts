// The home tab a person last chose, kept in a cookie so Home opens on it again. Only the two home tabs are kept. A pinned
// list is not, because it is opened by its own address and is not a default.
export const FEED_TAB_COOKIE = "rhenko-feed"

export type HomeTab = "for-you" | "following"

export function parseHomeTab(value: string | null | undefined): HomeTab | null {
  return value === "for-you" || value === "following" ? value : null
}
