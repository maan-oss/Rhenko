"use client"

import NextLink from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentProps } from "react"

export { useLinkStatus } from "next/link"

type LinkProps = ComponentProps<typeof NextLink>

// The link between pages of the app. Every such link moves the page the same way: the new page slides in from the right
// (nav-forward, see app/(app)/template.tsx). A link to the page that is already open moves nothing, so re-selecting the
// current tab does not slide the same content in again. A caller can name another transition, such as nav-back for the
// Back arrow.
export default function Link({ href, transitionTypes, ...rest }: LinkProps) {
  const pathname = usePathname()
  const target = typeof href === "string" ? href.split(/[?#]/)[0] : (href.pathname ?? "")
  const samepage = target === pathname
  return <NextLink href={href} transitionTypes={transitionTypes ?? (samepage ? undefined : ["nav-forward"])} {...rest} />
}
