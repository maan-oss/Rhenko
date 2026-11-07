"use server"

import Stripe from "stripe"
import { requireAgreedViewer } from "@/lib/auth"
import { startAgeCheck } from "@/lib/age-assurance"

type Started =
  | { ok: true; url: string }
  | { ok: true; adult: true }
  | { ok: true; processing: true }
  | { ok: false; error: string }

// Starts the age check, or returns the link for one already under way. The browser opens the link itself, so the
// return to Rhenko happens in the browser and not in a redirect from this action.
export async function beginAgeCheck(): Promise<Started> {
  const viewer = await requireAgreedViewer()
  const origin = (process.env.RHENKO_PUBLIC_URL ?? "").replace(/\/+$/, "")
  if (!origin || !process.env.STRIPE_SECRET_KEY) {
    return { ok: false, error: "Age checks are not set up on this server yet." }
  }
  try {
    const result = await startAgeCheck(viewer.id, `${origin}/settings/age`)
    if ("url" in result) return { ok: true, url: result.url }
    if ("processing" in result) return { ok: true, processing: true }
    return { ok: true, adult: true }
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      console.error("stripe identity request failed", error.type, error.code, error.message)
    } else {
      console.error("age check failed", error)
    }
    return { ok: false, error: "The age check could not start. Try again in a moment." }
  }
}
