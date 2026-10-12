import { getViewer } from "@/lib/auth"
import { getProfileByHandle } from "@/lib/data"
import { HANDLE_PATTERN } from "@/lib/rules"

// The short profile a hover card shows over a name or a picture. It is the account the profile page would show: the
// same account, the same visibility. A deactivated account, or one that blocked the viewer, has no card.
export async function GET(request: Request) {
  const viewer = await getViewer()
  if (!viewer) return Response.json({ error: "Sign in first." }, { status: 401 })

  const handle = new URL(request.url).searchParams.get("handle") ?? ""
  if (!HANDLE_PATTERN.test(handle)) return Response.json({ error: "No such account." }, { status: 404 })
  const profile = getProfileByHandle(handle, viewer.id)
  if (!profile || (profile.deactivated && profile.id !== viewer.id) || profile.relationship.blockedMe) {
    return Response.json({ error: "No such account." }, { status: 404 })
  }

  const rel = profile.relationship
  return Response.json({
    handle: profile.handle,
    name: profile.name,
    bio: profile.bio,
    avatarFile: profile.avatarFile,
    verified: profile.verified,
    paidVerified: profile.paidVerified,
    followers: profile.followers,
    following: profile.following,
    self: rel.self,
    followsMe: rel.followsMe,
    blockedByMe: rel.blockedByMe,
    state: rel.following ? "following" : rel.requested ? "requested" : "none",
  })
}
