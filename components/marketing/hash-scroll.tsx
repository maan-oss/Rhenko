"use client"

import { useEffect } from "react"

// A link to a section of the same page glides there instead of jumping. Only a link whose section is on the page is taken over:
// a link to another page, or to a section that is not there, goes the usual way. Reduced motion jumps at once.
export function HashScroll() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.("a[href^='#']")
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self")) return
      const id = decodeURIComponent(link.hash.slice(1))
      const section = id ? document.getElementById(id) : null
      if (!section) return
      event.preventDefault()
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY, behavior: reduced ? "auto" : "smooth" })
      window.history.replaceState(window.history.state, "", link.hash)
    }
    document.addEventListener("click", onClick)
    return () => document.removeEventListener("click", onClick)
  }, [])
  return null
}
