"use server"

import { revalidatePath } from "next/cache"
import { getAgreedViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { MAX_HOME_TABS } from "@/lib/rules"
import { checkTopic } from "@/lib/social-rules"
import {
  homeTabCount,
  isTopicTabPinned,
  moveHomeTab as storeMove,
  setTimelinePin,
  setTopicTabPin,
  type HomeTabRef,
} from "@/lib/timelines"

export type HomeTabResult = { ok: true } | { ok: false; error: string }

function refresh() {
  revalidatePath("/", "layout")
}

// Pins a followed topic as a Home tab, or takes it off. A topic has to be followed before it can be a tab, the same as a
// list has to be followed before it can be pinned. Lists and topics share the MAX_HOME_TABS limit.
export async function setTopicTab(tag: string, on: boolean): Promise<HomeTabResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to pin topics to Home." }
  const checked = checkTopic(tag)
  if (!checked.ok) return { ok: false, error: checked.error }
  if (on) {
    const followed = await get("SELECT 1 AS found FROM topic_follows WHERE user_id = ? AND tag = ?", viewer.id, checked.tag)
    if (!followed) return { ok: false, error: `Follow #${checked.tag} before you pin it to Home.` }
    if (!await isTopicTabPinned(viewer.id, checked.tag) && await homeTabCount(viewer.id) >= MAX_HOME_TABS) {
      return { ok: false, error: `Home holds up to ${MAX_HOME_TABS} tabs. Unpin one to add another.` }
    }
  }
  await setTopicTabPin(viewer.id, checked.tag, on, Date.now())
  refresh()
  return { ok: true }
}

// Moves a Home tab one place up or down. Asks for the place, not a flip, so a stale tab cannot undo a later move.
export async function moveHomeTab(tab: HomeTabRef, direction: -1 | 1): Promise<HomeTabResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to change your Home tabs." }
  const ref = await checkedRef(tab)
  if (!ref) return { ok: false, error: "That tab is no longer pinned to Home." }
  const moved = await storeMove(viewer.id, ref, direction, Date.now())
  if (!moved) return { ok: false, error: "That tab is already at the end." }
  refresh()
  return { ok: true }
}

// Takes a Home tab off Home. A list stays in the viewer's lists; a topic stays followed.
export async function unpinHomeTab(tab: HomeTabRef): Promise<HomeTabResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in to change your Home tabs." }
  const ref = await checkedRef(tab)
  if (!ref) return { ok: false, error: "That tab is already off Home." }
  if (ref.kind === "list") {
    await setTimelinePin(viewer.id, ref.id, false, Date.now())
  } else {
    await setTopicTabPin(viewer.id, ref.tag, false, Date.now())
  }
  refresh()
  return { ok: true }
}

// Accepts only a well-formed reference. A topic tag goes through the same check as a followed topic.
async function checkedRef(tab: HomeTabRef): Promise<HomeTabRef | null> {
  if (tab.kind === "list") return typeof tab.id === "string" && tab.id.length > 0 && tab.id.length <= 64 ? tab : null
  const checked = checkTopic(tab.tag)
  return checked.ok ? { kind: "topic", tag: checked.tag } : null
}
