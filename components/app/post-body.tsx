import { Fragment, type ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ExpandableText } from "@/components/app/expandable-text"

const TOKEN = /(https?:\/\/[^\s]+)|(@[A-Za-z0-9_]{3,15}(?![A-Za-z0-9_]))|(#[\p{L}\p{N}_]{1,50}(?![\p{L}\p{N}_]))|(\$[A-Za-z]{1,6}\b)/gu
const TRAILING = /[.,!?;:)\]]+$/
// A mark right after a letter, digit or one of @ # . / is part of an address, a URL path or "item#2". It stays plain.
const JOINED_BEFORE = /[\p{L}\p{N}_@#./]/u

// Emphasis: **bold**, ~~struck~~ and *italic*. A mark must touch its text (no space just inside it), so "2 * 3 * 4"
// stays plain. A web address is matched first and skipped whole, so an asterisk inside a link is never emphasis.
const EMPHASIS = /(https?:\/\/\S+)|\*\*(?=\S)([^\n]+?)(?<=\S)\*\*|~~(?=\S)([^\n]+?)(?<=\S)~~|\*(?=\S)([^*\n]+?)(?<=\S)\*/g

// A post longer than this folds, with a control to read the rest.
const FOLD_AFTER = 480

type Context = { key: number }

// A quoted post sits inside a link, so it never folds: a control inside a link would be invalid, and the quote is short anyway.
export function PostBody({ text, className, fold = true }: { text: string; className?: string; fold?: boolean }) {
  const body = <p className={cn("whitespace-pre-line break-words", className)}>{inline(text, { key: 0 })}</p>
  if (!fold || text.length <= FOLD_AFTER) return body
  return <ExpandableText>{body}</ExpandableText>
}

// Emphasis first, then the links, mentions, hashtags and cashtags inside whatever is left plain. Emphasis can hold
// those too, so it nests.
function inline(text: string, ctx: Context): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(EMPHASIS)) {
    // An address is left for the plain pass below, which turns it into a link.
    if (match[1] !== undefined) continue
    const start = match.index ?? 0
    if (start > last) nodes.push(...plain(text.slice(last, start), ctx))
    const whole = match[0]
    const [bold, strike, italic] = [match[2], match[3], match[4]]
    const inner = bold ?? strike ?? italic ?? ""
    const Tag = bold !== undefined ? "strong" : strike !== undefined ? "s" : "em"
    nodes.push(<Tag key={ctx.key++}>{inline(inner, ctx)}</Tag>)
    last = start + whole.length
  }
  if (last < text.length) nodes.push(...plain(text.slice(last), ctx))
  return nodes
}

function plain(text: string, ctx: Context): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0
    let token = match[0]
    if (!match[1] && start > 0 && JOINED_BEFORE.test(text[start - 1])) continue
    if (start > last) nodes.push(<Fragment key={ctx.key++}>{text.slice(last, start)}</Fragment>)
    if (match[1]) {
      const trailing = token.match(TRAILING)
      if (trailing) token = token.slice(0, -trailing[0].length)
    }
    nodes.push(renderToken(token, ctx.key++))
    last = start + token.length
  }
  if (last < text.length) nodes.push(<Fragment key={ctx.key++}>{text.slice(last)}</Fragment>)
  return nodes
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
