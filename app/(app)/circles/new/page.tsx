import { requireViewer } from "@/lib/auth"
import { CircleForm } from "@/components/app/circle-controls"
import { PageHeader } from "@/components/app/page-header"

export default async function NewCirclePage() {
  await requireViewer()
  return (
    <>
      <PageHeader title="Start a circle" backHref="/circles" />
      <p className="px-4 pt-4 text-[15px] text-muted-foreground">
        A circle is a small group with its own charter. Choose who can join now. You can change it later from the circle&rsquo;s
        settings.
      </p>
      <CircleForm />
    </>
  )
}
