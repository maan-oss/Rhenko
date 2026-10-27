import Link from "@/components/app/link"
import type { AdView } from "@/lib/ad-rules"
import { AdReport } from "@/components/app/ad-report"

// A sponsored post. It is labelled "Ad" in the same line as the advertiser, and it links to the policy that governs it.
// The button goes through the site's redirect, which counts the click without recording who clicked.
export function AdCard({ ad }: { ad: AdView }) {
  return (
    <article aria-label={`Ad from ${ad.advertiser}`} className="border-b border-border px-4 py-4">
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="font-semibold text-foreground">Ad</span>
        <span className="truncate">{ad.advertiser}</span>
      </div>
      <h3 className="mt-2 text-[17px] font-semibold leading-snug">{ad.headline}</h3>
      <p className="mt-1 text-[15px] leading-relaxed">{ad.body}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={ad.href}
          target="_blank"
          rel="sponsored noopener noreferrer"
          className="inline-flex h-10 items-center rounded-full border border-border px-4 text-[15px] font-semibold transition-colors duration-200 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ad.cta}
          <span className="sr-only"> (opens {ad.host} in a new tab)</span>
        </a>
        <p className="text-[13px] text-muted-foreground">
          {ad.host}. <Link href="/transparency/ads" className="underline underline-offset-4 hover:text-foreground">Why you see this, and our ad policy</Link>
        </p>
        <AdReport campaignId={ad.id} />
      </div>
    </article>
  )
}
