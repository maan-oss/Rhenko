import { requireViewer } from "@/lib/auth"
import { RevealSuspense } from "@/components/app/reveal-suspense"
import { snoozesFor } from "@/lib/topic-snoozes"
import { PageHeader } from "@/components/app/page-header"
import { SnoozedTopics } from "@/components/app/snoozed-topics"
import { HomeTabsEditor } from "@/components/app/home-tabs-editor"
import { pinnedTabs } from "@/lib/timelines"

// The topics snoozed out of For you, each until its time passes. Unsnoozing brings its posts back on the next load.
export default function ForYouSettingsPage() {
  return (
    <RevealSuspense>
      <ForYouSettingsBody />
    </RevealSuspense>
  )
}

async function ForYouSettingsBody() {
  const viewer = await requireViewer()
  // The page is rendered for each request, and a snooze is listed only while its time has not passed.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const rows = await snoozesFor(viewer.id, now)
  const tabs = await pinnedTabs(viewer.id, now)

  return (
    <>
      <PageHeader title="For you" backHref="/settings" />
      <section aria-labelledby="home-tabs" className="flex flex-col px-4 pt-5 pb-2">
        <h2 id="home-tabs" className="text-base font-semibold">
          Home tabs
        </h2>
        <p className="pt-1 pb-3 text-[13px] leading-relaxed text-muted-foreground">
          The tabs after For you and Following on Home. Move them into the order you read them in.
        </p>
        <HomeTabsEditor tabs={tabs} />
      </section>
      <section aria-labelledby="snoozed" className="flex flex-col px-4 pt-5 pb-5">
        <h2 id="snoozed" className="text-base font-semibold">
          Snoozed topics
        </h2>
        <p className="pt-1 pb-2 text-[13px] leading-relaxed text-muted-foreground">
          Posts with a snoozed hashtag or cashtag stay out of For you until its snooze ends. The topic stays followed, so its own page still works.
        </p>
        <SnoozedTopics rows={rows} />
      </section>
    </>
  )
}
