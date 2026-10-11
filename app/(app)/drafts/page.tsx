import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { ownPending } from "@/lib/data"
import { fullTimestamp } from "@/lib/format"
import { PageHeader } from "@/components/app/page-header"
import { PendingActions } from "@/components/app/pending-actions"
import { PostCard } from "@/components/app/post-card"
import { TabLinks } from "@/components/app/tabs"
import { CalendarClock, PenLine } from "lucide-react"

type SearchParams = Promise<{ tab?: string | string[] }>

export default function DraftsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <DraftsBody searchParams={searchParams} />
    </Suspense>
  )
}

async function DraftsBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const tab = params.tab === "scheduled" ? "scheduled" : "drafts"
  const posts = ownPending(viewer.id, tab === "drafts" ? "draft" : "scheduled")

  return (
    <>
      <PageHeader title="Drafts" />
      <TabLinks
        items={[
          { href: "/drafts", label: "Drafts", icon: <PenLine />, active: tab === "drafts" },
          { href: "/drafts?tab=scheduled", label: "Scheduled", icon: <CalendarClock />, active: tab === "scheduled" },
        ]}
      />
      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-6 pt-14 pb-16 text-center">
          <p className="text-lg font-semibold">{tab === "drafts" ? "No drafts" : "Nothing scheduled"}</p>
          <p className="max-w-sm text-muted-foreground">
            {tab === "drafts" ? "Save a post as a draft from the composer to finish it later." : "Schedule a post from the composer and it waits here until it goes out."}
          </p>
        </div>
      ) : (
        posts.map((post) => (
          <div key={post.id}>
            {tab === "scheduled" && post.publishAt ? (
              <p className="flex items-center gap-2 px-4 pt-3 text-sm text-muted-foreground">
                <CalendarClock className="size-4" aria-hidden="true" />
                Goes out {fullTimestamp(post.publishAt)}
              </p>
            ) : null}
            <PostCard post={post} viewer={viewer} />
            <PendingActions postId={post.id} mode={tab === "drafts" ? "draft" : "scheduled"} />
          </div>
        ))
      )}
    </>
  )
}
