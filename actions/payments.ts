"use server"

import Stripe from "stripe"
import { requireAgreedViewer } from "@/lib/auth"
import {
  CURRENCY,
  billingPortalUrl,
  paymentsConfigured,
  payoutOnboardingUrl,
  subscriptionCheckoutUrl,
  tipAmounts,
  tipCheckoutUrl,
  tipFeePercent,
  withdrawFromSubscription,
  type Kind,
} from "@/lib/payments"

type Started = { ok: true; url: string } | { ok: false; error: string }
type Done = { ok: true } | { ok: false; error: string }

const NOT_SET_UP = "Payments are not set up on this server yet."
const TRY_AGAIN = "Payments could not start. Try again in a moment."

// Errors from Stripe are logged, and the person sees a plain message. Errors from the app's own rules are shown as they are.
function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof Stripe.errors.StripeError) {
    console.error("stripe request failed", error.type, error.code, error.message)
    return { ok: false, error: TRY_AGAIN }
  }
  return { ok: false, error: error instanceof Error ? error.message : TRY_AGAIN }
}

function kindOf(value: unknown): Kind | null {
  return value === "plus" || value === "verified" ? value : null
}

export async function startSubscription(value: string): Promise<Started> {
  const viewer = await requireAgreedViewer()
  const kind = kindOf(value)
  if (!kind) return { ok: false, error: "That subscription does not exist." }
  if (!paymentsConfigured()) return { ok: false, error: NOT_SET_UP }
  try {
    return { ok: true, url: await subscriptionCheckoutUrl(viewer, kind) }
  } catch (error) {
    return failure(error)
  }
}

export async function openBilling(): Promise<Started> {
  const viewer = await requireAgreedViewer()
  if (!paymentsConfigured()) return { ok: false, error: NOT_SET_UP }
  try {
    return { ok: true, url: await billingPortalUrl(viewer) }
  } catch (error) {
    return failure(error)
  }
}

export async function withdraw(value: string): Promise<Done> {
  const viewer = await requireAgreedViewer()
  const kind = kindOf(value)
  if (!kind) return { ok: false, error: "That subscription does not exist." }
  if (!paymentsConfigured()) return { ok: false, error: NOT_SET_UP }
  try {
    return await withdrawFromSubscription(viewer, kind)
  } catch (error) {
    return failure(error)
  }
}

export async function startTip(postId: string, amount: number): Promise<Started> {
  const viewer = await requireAgreedViewer()
  if (typeof postId !== "string" || !Number.isInteger(amount)) return { ok: false, error: "That tip is not valid." }
  if (!paymentsConfigured()) return { ok: false, error: NOT_SET_UP }
  try {
    return { ok: true, url: await tipCheckoutUrl(viewer, postId, amount) }
  } catch (error) {
    return failure(error)
  }
}

// The amounts a person can tip, read from the same configuration the checkout enforces.
export async function tipOptions(): Promise<{ amounts: number[]; currency: string; feePercent: number }> {
  await requireAgreedViewer()
  return { amounts: tipAmounts(), currency: CURRENCY, feePercent: tipFeePercent() }
}

export async function startPayouts(): Promise<Started> {
  const viewer = await requireAgreedViewer()
  if (!paymentsConfigured()) return { ok: false, error: NOT_SET_UP }
  try {
    return { ok: true, url: await payoutOnboardingUrl(viewer) }
  } catch (error) {
    return failure(error)
  }
}
