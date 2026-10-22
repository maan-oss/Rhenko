"use client"

import { useEffect } from "react"

// Loads the page a server action names, as a full visit. A redirect from inside an action made the browser fetch that
// page's data as a router request, which the e2e suite caught answering 404 from a cached copy of /login. See
// sign-out-form.tsx for the same handoff on a form.
export function useFullVisit(to: string | undefined) {
  useEffect(() => {
    if (to) window.location.assign(to)
  }, [to])
}
