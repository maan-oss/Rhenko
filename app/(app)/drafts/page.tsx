import { CalendarClock, PenLine } from "lucide-react"
import { requireViewer } from "@/lib/auth"
import { ownPending } from "@/lib/data"
import { firstParam } from "@/lib/params"
import { ComposeAction } from "@/components/app/compose-action"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import { PostCard } from "@/components/app/post-card"
import { TabLinks } from "@/components/app/tabs"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ tab?: string | string[] }>

export default function DraftsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <RevealSuspense>
      <DraftsBody searchParams={searchParams} />
    </RevealSuspense>
  )
}

// Drafts and scheduled posts are the author's own. Each card offers Publish now and Delete, and nothing else: they have
// no readers yet, so they are not edited, liked, shared or counted. A scheduled post goes out by itself at its time.
async function DraftsBody({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireViewer()
  const params = await searchParams
  const tab = firstParam(params.tab) === "scheduled" ? "scheduled" : "drafts"
  const found = await ownPending(viewer.id, tab === "drafts" ? "draft" : "scheduled")
  // Scheduled posts are listed in the order they go out. Drafts keep the data layer's order, newest first.
  const posts = tab === "scheduled" ? [...found].sort((a, b) => (a.publishAt ?? 0) - (b.publishAt ?? 0)) : found

  return (
    <>
      <PageHeader title="Drafts">
        <TabLinks
          items={[
            { href: "/drafts", label: "Drafts", icon: <PenLine />, active: tab === "drafts" },
            { href: "/drafts?tab=scheduled", label: "Scheduled", icon: <CalendarClock />, active: tab === "scheduled" },
          ]}
        />
      </PageHeader>
      {posts.length === 0 ? (
        <EmptyState
          title={tab === "drafts" ? "No drafts" : "Nothing scheduled"}
          body={
            tab === "drafts"
              ? "Start a post and press Save draft. It waits here until you publish it."
              : "Write a post, press the calendar, and pick a time. It waits here and goes out by itself."
          }
        >
          <ComposeAction>Write a post</ComposeAction>
        </EmptyState>
      ) : (
        posts.map((post) => (
          <div key={post.id}>
            <PostCard post={post} viewer={viewer} draft />
          </div>
        ))
      )}
    </>
  )
}
