"use client"

import { useTransition, type ReactNode } from "react"
import { logout } from "@/actions/auth"

// Signs out, then loads the page the server names as a full visit. The sign-out used to end with a redirect inside the
// action, so the browser asked for the next page as a router request; that request could come back 404 from a cached
// copy of the page. Loading the page directly skips that request entirely.
export function SignOutForm({
  className,
  onSubmitted,
  children,
}: {
  className?: string
  onSubmitted?: () => void
  children: ReactNode
}) {
  const [pending, start] = useTransition()
  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        onSubmitted?.()
        start(async () => {
          try {
            const { to } = await logout()
            window.location.assign(to)
          } catch {
            // The sign-out did not finish. Reloading shows the account as it really is.
            window.location.reload()
          }
        })
      }}
    >
      {children}
    </form>
  )
}
