import type { LinkPreview } from "@/lib/link-previews"
import { cn } from "@/lib/utils"

// The card under a post's text, or a chat message's, for its first link: the page's title, a line of what it says, and where it
// is from. The whole card opens the page in a new tab. A post with photos or video shows those instead. The card has its own
// surface, so it reads the same on a post and inside a coloured chat bubble.
export function LinkCard({ preview, className }: { preview: LinkPreview; className?: string }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-embed=""
      className={cn(
        "relative z-10 mt-2 block w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-background text-foreground no-underline transition-colors duration-200 hover:bg-foreground/5",
        className
      )}
    >
      {preview.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${preview.image}?w=1280`} alt="" loading="lazy" decoding="async" className="aspect-[1.91/1] w-full object-cover" />
      ) : null}
      <span className="block px-4 py-3">
        {preview.site ? <span className="block truncate text-[13px] text-muted-foreground">{preview.site}</span> : null}
        <span className="mt-0.5 line-clamp-2 font-semibold tracking-tight [overflow-wrap:anywhere]">{preview.title}</span>
        {preview.description ? <span className="mt-1 line-clamp-2 text-[14px] text-muted-foreground [overflow-wrap:anywhere]">{preview.description}</span> : null}
      </span>
    </a>
  )
}
