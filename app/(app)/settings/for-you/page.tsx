import { requireViewer } from "@/lib/auth"
import { snoozesFor } from "@/lib/topic-snoozes"
import { PageHeader } from "@/components/app/page-header"
import { SnoozedTopics } from "@/components/app/snoozed-topics"

// The topics snoozed out of For you, each until its time passes. Unsnoozing brings its posts back on the next load.
export default async function ForYouSettingsPage() {
  const viewer = await requireViewer()
  // The page is rendered for each request, and a snooze is listed only while its time has not passed.
  // eslint-disable-next-line react-hooks/purity
  const rows = await snoozesFor(viewer.id, Date.now())

  return (
    <>
      <PageHeader title="For you" backHref="/settings" />
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
