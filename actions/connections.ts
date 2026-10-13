"use server"

import { revalidatePath } from "next/cache"
import { getViewer } from "@/lib/auth"
import { get } from "@/lib/db"
import { isLanguageCode, isSpeakLevel, type SpeakLevel } from "@/lib/languages"
import { areaProblem, isCountryCode } from "@/lib/places"
import {
  clearDismissals,
  dismissConnection,
  saveLanguages as storeLanguages,
  saveWhere as storeWhere,
  setOnboarding,
  suggestionsFor,
  topPeople,
  type SuggestedPerson,
} from "@/lib/connections"

export type ConnectionResult = { ok: true } | { ok: false; error: string }

const MAX_ID = 64

function refresh() {
  revalidatePath("/", "layout")
}

// Where someone is. The country is needed with an area, so people can be matched on the same city in the same country.
export async function saveWhere(input: { country: string; area: string; suggestNearby: boolean }): Promise<ConnectionResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to set where you are." }
  const country = typeof input.country === "string" ? input.country : ""
  const area = typeof input.area === "string" ? input.area : ""
  const problem = areaProblem(area)
  if (problem) return { ok: false, error: problem }
  if (country !== "" && !isCountryCode(country)) return { ok: false, error: "Choose a country from the list." }
  if (area.trim() !== "" && country === "") return { ok: false, error: "Choose your country as well." }
  storeWhere(viewer.id, { country, area, suggestNearby: input.suggestNearby === true })
  refresh()
  return { ok: true }
}

// The languages someone speaks (with a level) and is learning, and whether they are suggested as a language partner.
export async function saveLanguages(input: {
  speak: { code: string; level: string }[]
  learn: string[]
  suggestLanguage: boolean
}): Promise<ConnectionResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in to set your languages." }
  if (!Array.isArray(input.speak) || !Array.isArray(input.learn)) return { ok: false, error: "Something went wrong. Try again." }
  const speak: { code: string; level: SpeakLevel }[] = []
  for (const item of input.speak) {
    if (!item || typeof item.code !== "string" || typeof item.level !== "string") return { ok: false, error: "Something went wrong. Try again." }
    if (!isLanguageCode(item.code)) return { ok: false, error: "Choose languages from the list." }
    if (!isSpeakLevel(item.level)) return { ok: false, error: "Choose how well you speak each language." }
    if (speak.some((existing) => existing.code === item.code)) continue
    speak.push({ code: item.code, level: item.level })
  }
  for (const code of input.learn) {
    if (typeof code !== "string" || !isLanguageCode(code)) return { ok: false, error: "Choose languages from the list." }
  }
  if (speak.length > 12 || input.learn.length > 12) return { ok: false, error: "Choose up to 12 languages you speak and 12 you are learning." }
  storeLanguages(viewer.id, { speak, learn: input.learn, suggestLanguage: input.suggestLanguage === true })
  refresh()
  return { ok: true }
}

// Setup after sign-up is finished or skipped. Either way it does not show again, and the steps stay in Settings.
export async function finishSetup(value: "done" | "skipped"): Promise<ConnectionResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  setOnboarding(viewer.id, value === "done" ? "done" : "skipped")
  refresh()
  return { ok: true }
}

// "Not now" on a suggestion. The person is not suggested to this viewer again.
export async function dismissSuggestion(userId: string): Promise<ConnectionResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  if (typeof userId !== "string" || userId.length === 0 || userId.length > MAX_ID) return { ok: false, error: "That person can't be found." }
  if (userId === viewer.id) return { ok: false, error: "You can't suggest yourself." }
  if (!get("SELECT 1 AS found FROM users WHERE id = ?", userId)) return { ok: false, error: "That person can't be found." }
  dismissConnection(viewer.id, userId)
  refresh()
  return { ok: true }
}

// Brings back everyone dismissed with "Not now".
export async function resetDismissed(): Promise<ConnectionResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  clearDismissals(viewer.id)
  refresh()
  return { ok: true }
}

// The first few people the viewer could connect with, for the last setup step.
export async function suggestedPeople(): Promise<SuggestedPerson[]> {
  const viewer = await getViewer()
  if (!viewer) return []
  return topPeople(suggestionsFor(viewer.id, Date.now(), 6), 6)
}

// "Not now" on the setup prompt on Home. Setup stays available from Connect and from Settings.
export async function skipSetup(): Promise<void> {
  const viewer = await getViewer()
  if (viewer) setOnboarding(viewer.id, "skipped")
  refresh()
}
