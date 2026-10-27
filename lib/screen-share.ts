// Rules for sharing a screen during a call, kept apart from the call engine so they can be checked on their own.

// A screen is shared in a one-to-one call only. A group call is a mesh with no media server between the people in it:
// the person sharing would encode the screen once for each other person and send every copy up their own connection,
// five copies in a full call of six, beside everyone's voice. On a home or phone uplink that starves the audio for the
// whole call, and keeping one share going while people join and leave the mesh would need the server to track who is
// sharing. So a group call stays voice only and shows no Share screen button. Sharing in groups needs a media server
// that takes one copy from the person sharing and passes it on.
export const SCREEN_SHARE_PEOPLE = 2

export type ShareCall = { kind: "dm" | "group"; people: number }

export function screenShareAllowed(call: ShareCall): boolean {
  return call.kind === "dm" && call.people === SCREEN_SHARE_PEOPLE
}

// Only a browser that can capture a screen gets the button. Most iPhones and Android phones can't, so there the button
// is hidden rather than shown broken. They can still watch a screen the other person shares.
export function screenShareSupported(media: { getDisplayMedia?: unknown } | null | undefined): boolean {
  return typeof media?.getDisplayMedia === "function"
}

// The Share screen button shows once the call is connected, and stays while a share is on so it can always be stopped.
export function showsShareButton(call: ShareCall & { status: string; sharing: boolean; supported: boolean }): boolean {
  if (!call.supported || !screenShareAllowed(call)) return false
  if (call.status === "ended" || call.status === "idle" || call.status === "incoming") return false
  return call.sharing || call.status === "active" || call.status === "reconnecting"
}

// How a share reaches the other person. A camera that is sending gives its place to the screen (replaceTrack) and takes
// it back when the share stops, with no new setup. With no camera sending, the share adds a picture, which needs a new
// offer. A picture line kept from an earlier share is used again, so the connection doesn't grow a line for each share.
export type ShareRoute = "replace-camera" | "reuse" | "add"

export function shareRoute(input: { cameraSending: boolean; keptSender: boolean }): ShareRoute {
  if (input.cameraSending) return "replace-camera"
  return input.keptSender ? "reuse" : "add"
}

// What fills the picture of a one-to-one call. The other person's screen comes first, shown whole, since a screen is
// wide and cropping it would cut off what they are showing. Then their camera, cropped to fill the frame. In a voice
// call with no other picture, this person's own shared screen fills it, so they can see what is going out.
export type PictureLead = "their-screen" | "their-camera" | "my-screen" | null

export function pictureLead(input: { remoteScreen: boolean; video: boolean; sharing: boolean }): PictureLead {
  if (input.remoteScreen) return "their-screen"
  if (input.video) return "their-camera"
  return input.sharing ? "my-screen" : null
}

// A screen keeps its whole picture. A camera fills its frame.
export function pictureFit(lead: Exclude<PictureLead, null>): "contain" | "cover" {
  return lead === "their-camera" ? "cover" : "contain"
}
