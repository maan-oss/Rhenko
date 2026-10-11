import { notFound } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle } from "@/lib/data"
import { PeopleBody } from "@/components/app/people-body"

type Params = Promise<{ handle: string }>

// Existence checks run before anything streams, so a missing record gets a real 404.
export const instant = false

export default async function FollowersPage({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { handle } = await params
  const profile = getProfileByHandle(handle, viewer.id)
  if (!profile || (profile.deactivated && profile.id !== viewer.id) || profile.relationship.blockedMe) notFound()
  return <FollowersBody handle={handle} />
}

async function FollowersBody({ handle }: { handle: string }) {
  return <PeopleBody handle={handle} kind="followers" />
}
