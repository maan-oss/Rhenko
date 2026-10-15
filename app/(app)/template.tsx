import type { ReactNode } from "react"

// Each page in the app fades in as it opens. A template makes a fresh wrapper on every move between pages, so the fade runs
// each time: circles, settings and every other section included. Opacity only, so fixed elements inside a page still sit on
// the screen (see page-in in globals.css).
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-in">{children}</div>
}
