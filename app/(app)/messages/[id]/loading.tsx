import { Skeleton } from "@/components/ui/skeleton"

// Shown at once when a conversation opens, in the shape of a thread, so the page reads as loading straight away.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col">
      <span className="sr-only">Loading conversation</span>
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <Skeleton className="h-10 w-3/5 rounded-[20px]" />
        <Skeleton className="ml-auto h-10 w-2/5 rounded-[20px]" />
        <Skeleton className="h-16 w-1/2 rounded-[20px]" />
        <Skeleton className="ml-auto h-10 w-1/3 rounded-[20px]" />
      </div>
    </div>
  )
}
