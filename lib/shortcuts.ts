export type Shortcut = { keys: string; label: string }

// Keys the app listens for. Shown on the keyboard shortcuts settings page.
export const SHORTCUTS: Shortcut[] = [
  { keys: "n", label: "New post" },
  { keys: "/", label: "Search" },
  { keys: "j / k", label: "Next or previous post" },
  { keys: "g then h", label: "Home" },
  { keys: "g then e", label: "Explore" },
  { keys: "g then n", label: "Notifications" },
  { keys: "g then m", label: "Messages" },
  { keys: "g then b", label: "Bookmarks" },
  { keys: "g then p", label: "Your profile" },
  { keys: "?", label: "Show these shortcuts" },
]
