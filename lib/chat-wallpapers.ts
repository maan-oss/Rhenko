// The backgrounds a person can choose for a chat. Only the choice is stored, per person and per chat, so nobody else sees it.
// The look of each one is in app/globals.css, built from the page's own two colours so it reads in both themes. Pure functions
// only (tests/chat-message-rules.test.mjs).

export const WALLPAPERS = [
  { key: "none", label: "Default", note: "The plain page" },
  { key: "dusk", label: "Dusk", note: "A soft glow from the top" },
  { key: "paper", label: "Paper", note: "A quiet tint" },
  { key: "mist", label: "Mist", note: "A grey fade" },
  { key: "ink", label: "Ink", note: "A deeper tint" },
] as const

export type WallpaperKey = (typeof WALLPAPERS)[number]["key"]

// The choice a request names, or null for anything that isn't one of the set.
export function wallpaperInput(raw: unknown): WallpaperKey | null {
  if (typeof raw !== "string") return null
  return WALLPAPERS.find((wallpaper) => wallpaper.key === raw)?.key ?? null
}

// What a stored value reads as. Anything unknown, including a value from an older version, is the default.
export function wallpaperOf(stored: string | null | undefined): WallpaperKey {
  return wallpaperInput(stored) ?? "none"
}
