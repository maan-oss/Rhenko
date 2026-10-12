import { FeedSkeleton } from "@/components/app/feed-skeleton"

// Shown at once while a page in the app loads. The sidebar and the rail stay on screen, so only the main column waits.
export default function Loading() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <FeedSkeleton />
    </div>
  )
}
