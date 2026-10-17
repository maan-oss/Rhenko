import { paymentsConfigured, processStripeEvent, webhookEvent } from "@/lib/payments"

// Stripe's webhook. Each request is checked against the signing secret before anything is read or recorded, and a
// failed check is refused. A processing failure answers with an error code, so Stripe sends the event again later.

export async function POST(request: Request): Promise<Response> {
  if (!paymentsConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Payments are not set up on this server.", { status: 503, headers: { "Cache-Control": "no-store" } })
  }
  const payload = await request.text()
  const signature = request.headers.get("stripe-signature") ?? ""
  let event
  try {
    event = webhookEvent(payload, signature)
  } catch {
    return new Response("Signature check failed.", { status: 400, headers: { "Cache-Control": "no-store" } })
  }
  try {
    await processStripeEvent(event)
  } catch (error) {
    console.error("stripe webhook failed", event.type, error)
    return new Response("Could not process the event.", { status: 500, headers: { "Cache-Control": "no-store" } })
  }
  return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } })
}
