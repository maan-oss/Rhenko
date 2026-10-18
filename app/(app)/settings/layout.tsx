import type { ReactNode } from "react"

// Every settings page carries this marker. On a wide screen it lets the app shell drop its right-hand rail and give the
// column more room (see globals.css), since the rail's trends have nothing to do with settings.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <div data-settings-shell className="contents">{children}</div>
}
