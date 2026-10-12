import type { LinkPreview } from "@/lib/link-previews"

// The card under a post's text for its first link: the page's title, a line of what it says, and where it is from.
// The whole card opens the page in a new tab. A post with photos or video shows those instead.
export function LinkCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="relative z-10 mt-2 block overflow-hidden rounded-2xl border border-border text-foreground no-underline transition-colors duration-200 hover:bg-foreground/5"
    >
      {preview.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${preview.image}?w=1280`} alt="" loading="lazy" decoding="async" className="aspect-[1.91/1] w-full object-cover" />
      ) : null}
      <span className="block px-4 py-3">
        {preview.site ? <span className="block truncate text-[13px] text-muted-foreground">{preview.site}</span> : null}
        <span className="mt-0.5 block line-clamp-2 font-semibold tracking-tight">{preview.title}</span>
        {preview.description ? <span className="mt-1 block line-clamp-2 text-[14px] text-muted-foreground">{preview.description}</span> : null}
      </span>
    </a>
  )
}
