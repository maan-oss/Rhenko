"use server"

import { getAgreedViewer } from "@/lib/auth"
import { forgetRanking } from "@/lib/data"
import { normalizeTag } from "@/lib/rules"
import { snoozeTopic, unsnoozeTopic } from "@/lib/topic-snoozes"

const MAX_TAG = 100

// Keeps a topic's posts out of For you for a while. The topic stays followed, and For you is ranked again on the next load.
export async function snoozeForYouTopic(tag: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to snooze topics." }
  const clean = normalizeTag(String(tag)).trim()
  if (!clean || clean.length > MAX_TAG) return { ok: false, error: "That isn't a topic." }
  await snoozeTopic(viewer.id, clean, Date.now())
  forgetRanking(viewer.id)
  return { ok: true }
}

// Lets a topic's posts back into For you.
export async function unsnoozeForYouTopic(tag: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to change snoozed topics." }
  const clean = normalizeTag(String(tag)).trim()
  if (!clean || clean.length > MAX_TAG) return { ok: false, error: "That isn't a topic." }
  await unsnoozeTopic(viewer.id, clean)
  forgetRanking(viewer.id)
  return { ok: true }
}
