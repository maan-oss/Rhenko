import { notFound, redirect } from "next/navigation"
import { requireAgreedViewer } from "@/lib/auth"
import { boostSetupFor } from "@/lib/boost-setup"
import { BoostSheetBody } from "@/components/app/boost-sheet"
import { PageHeader } from "@/components/app/page-header"

type Params = Promise<{ handle: string; postId: string }>

// The boost for one post, opened by its link. From a post, Boost post opens the same thing as a sheet over the post instead.
export default async function BoostPostPage({ params }: { params: Params }) {
  const viewer = await requireAgreedViewer()
  const { handle, postId } = await params
  const setup = await boostSetupFor(viewer.id, postId)
  if (setup.kind === "missing") notFound()
  if (setup.kind === "boosted") redirect(`/advertise/campaigns/${setup.campaignId}`)
  if (setup.handle.toLowerCase() !== handle.toLowerCase()) redirect(`/${setup.handle}/status/${postId}/boost`)

  return (
    <>
      <PageHeader title="Boost post" backHref={`/${setup.handle}/status/${postId}`} />
      <div className="mx-auto w-full max-w-[560px]">
        <BoostSheetBody setup={setup} />
      </div>
    </>
  )
}
