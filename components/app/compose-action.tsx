"use client"

import type { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { emptyActionClass } from "@/components/app/empty-state"

// Opens the composer. On the home page it scrolls to it and puts the cursor in the text; anywhere else it goes there.
// Pages stay mounted while hidden, so the home composer is only used when the home page is the one on screen.
export function ComposeAction({ children = "Write a post", kind = "primary" }: { children?: ReactNode; kind?: "primary" | "secondary" }) {
  const router = useRouter()

  function open() {
    const field = window.location.pathname === "/" ? document.querySelector<HTMLTextAreaElement>("#compose textarea") : null
    if (!field) {
      router.push("/#compose")
      return
    }
    field.closest("form")?.scrollIntoView({ block: "start", behavior: "smooth" })
    field.focus({ preventScroll: true })
  }

  return (
    <button type="button" onClick={open} className={emptyActionClass(kind)}>
      {children}
    </button>
  )
}
