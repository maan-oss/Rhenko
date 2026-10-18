import { Skeleton } from "@/components/ui/skeleton"

// The shape of a list of posts while its content loads: an avatar and three lines for each. Shown by a route's loading
// state and by a feed that is still on its way from the server. It is hidden from screen readers; the page's own
// status line says what is loading.
export function FeedSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5 px-4 py-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
