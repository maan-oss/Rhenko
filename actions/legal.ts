"use server"

import { redirect } from "next/navigation"
import { clientIp, getAgreedViewer, getViewer, newId } from "@/lib/auth"
import { get, run } from "@/lib/db"
import { sendMail } from "@/lib/mail"
import { hidePost } from "@/lib/moderation"
import { COUNTER_RESTORE_BUSINESS_DAYS, INTIMATE_REMOVAL_HOURS, NOTICE_KINDS, TERMS_VERSION, URGENT_KINDS, noticeKindLabel } from "@/lib/legal"
import { addBusinessDays } from "@/lib/business-days"
import { copyrightNoticeProblem, counterNoticeProblem } from "@/lib/notice-rules"
import { consume, waitLabel } from "@/lib/rate-limit"

export type LegalState = { error?: string; ok?: boolean; reference?: string }
export type CounterState = { error?: string; ok?: boolean; restoreFrom?: number; restoreBy?: number }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// The current Terms, accepted by the person. Their account records the version and the time.
export async function acceptTerms(_prev: LegalState, formData: FormData): Promise<LegalState> {
  const viewer = await getViewer()
  if (!viewer) return { error: "Sign in first." }
  if (formData.get("agree") !== "on") return { error: "Tick the box to agree to the current Terms and Privacy Policy." }
  await run("UPDATE users SET terms_version = ?, terms_accepted_at = ? WHERE id = ?", TERMS_VERSION, Date.now(), viewer.id)
  redirect("/")
}

// The author of a hidden post answers the notice once, within the appeal window.
export async function appealNotice(_prev: LegalState, formData: FormData): Promise<LegalState> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in to appeal." }
  const noticeId = String(formData.get("notice") ?? "")
  const reason = String(formData.get("reason") ?? "").replace(/\r\n/g, "\n").trim()
  const notice = await get<{ id: string; user_id: string; appeal_until: number; restored_at: number | null }>(
    "SELECT id, user_id, appeal_until, restored_at FROM moderation_notices WHERE id = ?",
    noticeId
  )
  if (!notice || notice.user_id !== viewer.id) return { error: "That notice isn't on your account." }
  if (notice.restored_at !== null) return { error: "That post was already put back." }
  if (Date.now() > notice.appeal_until) return { error: "The time to appeal this notice has passed." }
  if (await get("SELECT id FROM appeals WHERE notice_id = ?", notice.id)) return { error: "You have already appealed this notice." }
  if (await get("SELECT id FROM counter_notices WHERE notice_id = ?", notice.id)) {
    return { error: "You have already sent a counter-notice for this post, so it cannot be appealed too." }
  }
  if ([...reason].length < 10) return { error: "Say in a sentence or two why the decision should change." }
  if ([...reason].length > 2000) return { error: "Keep the appeal under 2,000 characters." }
  await run(
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

  const limit = await consume(`notice:${await clientIp()}`, 10, HOUR)
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
  const phone = String(formData.get("phone") ?? "").trim()
  const authorized = formData.get("authorized") === "on"

  if ([...name].length < 2 || [...name].length > 100) return { error: "Give your name, between 2 and 100 characters." }
  if (!EMAIL.test(email) || email.length > 200) return { error: "Give an email address we can reply to." }
  if (address.length > 300) return { error: "Keep the address under 300 characters." }
  if (url !== "" && !/^https?:\/\/\S+$/.test(url)) return { error: "The link must start with http:// or https://." }
  if (url.length > 500) return { error: "Keep the link under 500 characters." }
  const copyrightProblem = copyrightNoticeProblem({ kind, work, url, address, phone, authorized })
  if (copyrightProblem) return { error: copyrightProblem }
  if ([...description].length < 20) return { error: "Describe what is wrong with the content, in at least 20 characters." }
  if ([...description].length > 2000) return { error: "Keep the description under 2,000 characters." }
  if (formData.get("good_faith") !== "on") return { error: "Confirm that you believe in good faith that this use is not authorised." }
  if (formData.get("accurate") !== "on") return { error: "Confirm that what you have written is accurate." }
  if ([...signature].length < 2 || [...signature].length > 100) return { error: "Type your full name as your signature." }

  // The post a link points at, when the link is one of this server's post addresses.
  const match = /\/status\/([0-9a-f-]{36})/i.exec(url)
  const postId = match && await get("SELECT id FROM posts WHERE id = ?", match[1]) ? match[1] : null

  const id = newId()
  const now = Date.now()
  await run(
    `INSERT INTO legal_notices (id, kind, name, email, address, url, post_id, work, description, good_faith, accurate, signature, phone, authorized, due_by, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, 'open', ?)`,
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
    phone,
    authorized ? 1 : 0,
    kind === "intimate_image" ? now + INTIMATE_REMOVAL_HOURS * HOUR : null,
    now
  )

  if (postId && URGENT_KINDS.has(kind)) {
    await hidePost({
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

function day(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

// The author of a post removed for copyright answers with a counter-notice (17 U.S.C. 512(g)). It goes to the owner who sent the
// notice, in full, and the post goes back 10 to 14 business days after it arrives, unless the owner says it has started a court action.
export async function submitCounterNotice(_prev: CounterState, formData: FormData): Promise<CounterState> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { error: "Sign in to send a counter-notice." }
  const noticeId = String(formData.get("notice") ?? "")
  const notice = await get<{
    id: string
    user_id: string
    post_id: string
    category: string
    source: string
    appeal_until: number
    restored_at: number | null
    post_exists: number | string
  }>(
    `SELECT n.id, n.user_id, n.post_id, n.category, n.source, n.appeal_until, n.restored_at,
            (SELECT COUNT(*) FROM posts p WHERE p.id = n.post_id) AS post_exists
       FROM moderation_notices n WHERE n.id = ?`,
    noticeId
  )
  if (!notice || notice.user_id !== viewer.id) return { error: "That notice isn't on your account." }
  if (notice.category !== "copyright" || !notice.source.startsWith("legal:")) {
    return { error: "Only a post removed for copyright can be answered with a counter-notice. You can appeal it instead." }
  }
  if (notice.restored_at !== null) return { error: "That post was already put back." }
  if (Number(notice.post_exists) === 0) return { error: "That post has been deleted, so there is nothing to put back." }
  if (Date.now() > notice.appeal_until) return { error: "The time to answer this notice has passed." }
  if (await get("SELECT id FROM counter_notices WHERE notice_id = ?", notice.id)) {
    return { error: "You have already sent a counter-notice for this post." }
  }
  if (await get("SELECT id FROM appeals WHERE notice_id = ?", notice.id)) {
    return { error: "You have already appealed this notice, so a counter-notice cannot be sent too." }
  }
  const complaint = await get<{ id: string; email: string }>("SELECT id, email FROM legal_notices WHERE id = ?", notice.source.slice("legal:".length))
  if (!complaint) return { error: "The copyright notice for this post can't be found." }

  const fields = {
    name: String(formData.get("name") ?? "").trim(),
    address: String(formData.get("address") ?? "").replace(/\r\n/g, "\n").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    signature: String(formData.get("signature") ?? "").trim(),
    mistake: formData.get("mistake") === "on",
    consent: formData.get("consent") === "on",
  }
  const problem = counterNoticeProblem(fields)
  if (problem) return { error: problem }

  const now = Date.now()
  const restoreFrom = addBusinessDays(now, COUNTER_RESTORE_BUSINESS_DAYS.from)
  const restoreBy = addBusinessDays(now, COUNTER_RESTORE_BUSINESS_DAYS.by)
  const id = newId()
  const removedLocation = `/status/${notice.post_id}`
  await run(
    `INSERT INTO counter_notices (id, notice_id, user_id, name, address, phone, signature, removed_location, created_at, restore_from, restore_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    notice.id,
    viewer.id,
    fields.name,
    fields.address,
    fields.phone,
    fields.signature,
    removedLocation,
    now,
    restoreFrom,
    restoreBy
  )

  // The owner receives the counter-notice in full, and is told how to say they have started a court action (17 U.S.C. 512(g)(2)(B)).
  const agent = process.env.RHENKO_COPYRIGHT_AGENT_EMAIL ?? ""
  const sent = await sendMail({
    to: complaint.email,
    subject: `Counter-notice about your copyright notice (${complaint.id.slice(0, 8)})`,
    text: [
      `We received a counter-notice about the material in your copyright notice (reference ${complaint.id}).`,
      "",
      "Under 17 U.S.C. 512(g) we pass it to you in full.",
      "",
      `Material removed: ${removedLocation} on Rhenko`,
      `Name: ${fields.name}`,
      `Address: ${fields.address}`,
      `Telephone: ${fields.phone}`,
      `Signature: ${fields.signature}`,
      "",
      "The person who sent it states, under penalty of perjury, that they have a good faith belief the material was removed or disabled as a result of mistake or misidentification. They consent to the jurisdiction of the federal district court for their address, and will accept service of process from you.",
      "",
      `Unless you tell us that you have filed an action seeking a court order to restrain them from the infringing activity, the material goes back no sooner than ${day(restoreFrom)} and no later than ${day(restoreBy)}, which is 10 to 14 business days after this counter-notice arrived.`,
      "",
      `To tell us about a court action, write to the designated agent${agent ? ` at ${agent}` : " (the address is on our copyright page)"}, quoting reference ${complaint.id}.`,
    ].join("\n"),
  })
  if (sent.ok) await run("UPDATE counter_notices SET forwarded_at = ? WHERE id = ?", Date.now(), id)
  else console.error("[legal] could not forward a counter-notice", sent.error)

  return { ok: true, restoreFrom, restoreBy }
}
