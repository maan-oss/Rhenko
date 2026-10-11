"use server"

import { redirect } from "next/navigation"
import { clientIp, getViewer, newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { hidePost } from "@/lib/moderation"
import { NOTICE_KINDS, TERMS_VERSION, URGENT_KINDS, noticeKindLabel } from "@/lib/legal"
import { consume, waitLabel } from "@/lib/rate-limit"

export type LegalState = { error?: string; ok?: boolean; reference?: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// The current Terms, accepted by the person. Their account records the version and the time.
export async function acceptTerms(_prev: LegalState, formData: FormData): Promise<LegalState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  if (formData.get("agree") !== "on") return { error: "Tick the box to agree to the current Terms and Privacy Policy." }
  run("UPDATE users SET terms_version = ?, terms_accepted_at = ? WHERE id = ?", TERMS_VERSION, Date.now(), viewer.id)
  redirect("/")
}

// The author of a hidden post answers the notice once, within the appeal window.
export async function appealNotice(_prev: LegalState, formData: FormData): Promise<LegalState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in to appeal." }
  const noticeId = String(formData.get("notice") ?? "")
  const reason = String(formData.get("reason") ?? "").replace(/\r\n/g, "\n").trim()
  const notice = get<{ id: string; user_id: string; appeal_until: number; restored_at: number | null }>(
    "SELECT id, user_id, appeal_until, restored_at FROM moderation_notices WHERE id = ?",
    noticeId
  )
  if (!notice || notice.user_id !== viewer.id) return { error: "That notice isn't on your account." }
  if (notice.restored_at !== null) return { error: "That post was already put back." }
  if (Date.now() > notice.appeal_until) return { error: "The time to appeal this notice has passed." }
  if (get("SELECT id FROM appeals WHERE notice_id = ?", notice.id)) return { error: "You have already appealed this notice." }
  if ([...reason].length < 10) return { error: "Say in a sentence or two why the decision should change." }
  if ([...reason].length > 2000) return { error: "Keep the appeal under 2,000 characters." }
  run(
    "INSERT INTO appeals (id, notice_id, user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)",
    newId(),
    notice.id,
    viewer.id,
    reason,
    Date.now()
  )
  return { ok: true }
}

// A notice about content, from anyone: a copyright owner, someone pictured in an image, a parent, a lawyer, a regulator's
// contact. Notices about intimate images and child sexual abuse hide the post the moment they arrive.
export async function submitNotice(_prev: LegalState, formData: FormData): Promise<LegalState> {
  // A hidden field no person fills in. A form filled by a bot is accepted quietly and goes nowhere.
  if (String(formData.get("website") ?? "") !== "") return { ok: true, reference: "received" }

  const limit = consume(`notice:${await clientIp()}`, 10, HOUR)
  if (!limit.ok) return { error: `Too many notices from this network. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }

  const kind = String(formData.get("kind") ?? "")
  if (!NOTICE_KINDS.some((k) => k.id === kind)) return { error: "Choose what the notice is about." }
  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const url = String(formData.get("url") ?? "").trim()
  const work = String(formData.get("work") ?? "").trim()
  const description = String(formData.get("description") ?? "").replace(/\r\n/g, "\n").trim()
  const signature = String(formData.get("signature") ?? "").trim()

  if ([...name].length < 2 || [...name].length > 100) return { error: "Give your name, between 2 and 100 characters." }
  if (!EMAIL.test(email) || email.length > 200) return { error: "Give an email address we can reply to." }
  if (address.length > 300) return { error: "Keep the address under 300 characters." }
  if (url !== "" && !/^https?:\/\/\S+$/.test(url)) return { error: "The link must start with http:// or https://." }
  if (url.length > 500) return { error: "Keep the link under 500 characters." }
  if (kind === "copyright" && [...work].length < 3) return { error: "Name the work you own that is being copied." }
  if ([...description].length < 20) return { error: "Describe what is wrong with the content, in at least 20 characters." }
  if ([...description].length > 2000) return { error: "Keep the description under 2,000 characters." }
  if (formData.get("good_faith") !== "on") return { error: "Confirm that you believe in good faith that this use is not authorised." }
  if (formData.get("accurate") !== "on") return { error: "Confirm that what you have written is accurate." }
  if ([...signature].length < 2 || [...signature].length > 100) return { error: "Type your full name as your signature." }

  // The post a link points at, when the link is one of this server's post addresses.
  const match = /\/status\/([0-9a-f-]{36})/i.exec(url)
  const postId = match && get("SELECT id FROM posts WHERE id = ?", match[1]) ? match[1] : null

  const id = newId()
  run(
    `INSERT INTO legal_notices (id, kind, name, email, address, url, post_id, work, description, good_faith, accurate, signature, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'open', ?)`,
    id,
    kind,
    name,
    email,
    address,
    url,
    postId,
    work,
    description,
    signature,
    Date.now()
  )

  if (postId && URGENT_KINDS.has(kind)) {
    hidePost({
      postId,
      category: kind,
      explanation: `Hidden while we review a notice about ${noticeKindLabel(kind).toLowerCase()}.`,
      source: `legal:${id}`,
    })
  }

  // The person who sent the notice gets its reference straight away (DSA Article 16(4)).
  const sent = await sendMail({
    to: email,
    subject: `We received your notice (${id.slice(0, 8)})`,
    text: [
      `We received your notice about ${noticeKindLabel(kind).toLowerCase()}.`,
      "",
      `Reference: ${id}`,
      "",
      "We review each notice and will email you what we decided, and why. You don't need to do anything else.",
      "If you did not send this notice, you can ignore this email.",
    ].join("\n"),
  })
  if (!sent.ok) console.error("[legal] could not acknowledge a notice", sent.error)

  return { ok: true, reference: id }
}
