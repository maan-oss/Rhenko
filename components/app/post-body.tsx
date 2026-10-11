import { Fragment, type ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

const TOKEN = /(https?:\/\/[^\s]+)|(@[A-Za-z0-9_]{3,15}(?![A-Za-z0-9_]))|(#[\p{L}\p{N}_]{1,50}(?![\p{L}\p{N}_]))|(\$[A-Za-z]{1,6}\b)/gu
const TRAILING = /[.,!?;:)\]]+$/
// A mark right after a letter, digit or one of @ # . / is part of an address, a URL path or "item#2". It stays plain.
const JOINED_BEFORE = /[\p{L}\p{N}_@#./]/u

export function PostBody({ text, className }: { text: string; className?: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0
    let token = match[0]
    if (!match[1] && start > 0 && JOINED_BEFORE.test(text[start - 1])) continue
    if (start > last) nodes.push(<Fragment key={key++}>{text.slice(last, start)}</Fragment>)
    if (match[1]) {
      const trailing = token.match(TRAILING)
      if (trailing) token = token.slice(0, -trailing[0].length)
    }
    nodes.push(renderToken(token, key++))
    last = start + token.length
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)

  return <p className={cn("whitespace-pre-line break-words", className)}>{nodes}</p>
}

function renderToken(token: string, key: number): ReactNode {
  if (token.startsWith("http")) {
    return (
      <a key={key} href={token} target="_blank" rel="noopener noreferrer nofollow" className="relative z-10 break-all text-dusk underline underline-offset-4">
        {token}
      </a>
    )
  }
  if (token.startsWith("@")) {
    return (
      <Link key={key} href={`/${token.slice(1)}`} className="relative z-10 font-medium text-dusk hover:underline">
        {token}
      </Link>
    )
  }
  if (token.startsWith("$")) {
    return (
      <Link key={key} href={`/search?q=${encodeURIComponent(token)}`} className="relative z-10 font-medium text-dusk hover:underline">
        {token}
      </Link>
    )
  }
  return (
    <Link key={key} href={`/topics/${encodeURIComponent(token.slice(1).toLowerCase())}`} className="relative z-10 text-dusk hover:underline">
      {token}
    </Link>
  )
}
