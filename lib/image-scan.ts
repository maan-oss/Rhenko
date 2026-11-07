// Known child sexual abuse material is checked on every image and video before it is stored. The hash lists come from a
// provider under its own terms (Thorn's Safer, sold through AWS Marketplace, is one example; Google's CSAI Match for video is
// another). Rhenko does not keep lists of its own. The provider's adapter is added once an agreement is signed and its API is
// known; until then this server refuses every image and video upload. Text, links and documents are not affected.
//
// RHENKO_IMAGE_SCAN selects the scanner:
//   unset or "none"  refuse every image and video upload (the default, and the state production must not leave)
//   "test"           accept everything; only allowed outside production, so the end-to-end checks can upload media
// Any other value is refused the same way as "none", and logged, so a typo cannot switch scanning off.

export type ScanResult = { ok: true } | { ok: false; match: boolean; error: string }

export const SCAN_REFUSED = "Photos and videos cannot be shared on Rhenko yet. Text posts and messages still work."
// An encrypted chat's file is sealed on the sender's device, so the server cannot tell a photo from a voice note or a document.
// The only rule it can enforce is to refuse every sealed file until a scanner exists. This is a decision, not an oversight.
export const SEALED_REFUSED = "Files cannot be sent in encrypted chats yet. Text messages still work."

export function scanMode(): "none" | "test" | "unknown" {
  const value = (process.env.RHENKO_IMAGE_SCAN ?? "none").trim().toLowerCase()
  if (value === "none" || value === "") return "none"
  if (value === "test" && process.env.NODE_ENV !== "production") return "test"
  if (value === "test") {
    console.error("RHENKO_IMAGE_SCAN=test is not allowed in production; refusing media uploads")
    return "unknown"
  }
  console.error(`RHENKO_IMAGE_SCAN=${value} has no adapter on this server; refusing media uploads`)
  return "unknown"
}

// Every image and video runs through here before its bytes are written. A refusal means nothing is stored. The file is passed
// rather than its bytes, so a video is never held whole in memory; a provider adapter reads it when one is added.
export async function scanMedia(file: File): Promise<ScanResult> {
  // No provider adapter yet, so nothing reads the file. An adapter will.
  void file
  if (scanMode() === "test") return { ok: true }
  return { ok: false, match: false, error: SCAN_REFUSED }
}

// Every sealed file runs through here before it is stored. Refused unless a scanner that can read sealed files exists.
export async function scanSealed(): Promise<ScanResult> {
  if (scanMode() === "test") return { ok: true }
  return { ok: false, match: false, error: SEALED_REFUSED }
}
