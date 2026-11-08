// A stand-in for the parts of Stripe's API that Rhenko uses, for the end-to-end test. It runs inside the test process and
// answers the same requests the Stripe SDK sends (form-encoded bodies, JSON answers). Its checkout pages stand in for
// Stripe's own: "Pay" takes the payment, sends the signed webhook event Stripe would send to the app, and returns the
// person to the app's success address. Nothing here touches Stripe. Live keys are never used by the suite.
import http from "node:http"
import Stripe from "stripe"

const signer = new Stripe("sk_test_e2e_signer")

// Stripe sends nested form keys such as line_items[0][price]. This turns them into objects and arrays.
function parseForm(text) {
  const root = {}
  for (const [key, value] of new URLSearchParams(text)) {
    const parts = key.split(/\[|\]/).filter(Boolean)
    let node = root
    parts.forEach((part, index) => {
      const last = index === parts.length - 1
      const next = /^\d+$/.test(parts[index + 1] ?? "") ? [] : {}
      if (last) node[part] = value
      else {
        if (node[part] === undefined) node[part] = next
        node = node[part]
      }
    })
  }
  return root
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on("data", (chunk) => chunks.push(chunk))
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    request.on("error", reject)
  })
}

function send(response, status, body, type = "application/json") {
  response.writeHead(status, { "Content-Type": type })
  response.end(typeof body === "string" ? body : JSON.stringify(body))
}

let counter = 0
const id = (prefix) => `${prefix}_e2e_${Date.now().toString(36)}${(++counter).toString(36)}`
const now = () => Math.floor(Date.now() / 1000)

export async function startStripeMock({ port, webhookUrl, webhookSecret, origin }) {
  const state = {
    sessions: new Map(),
    subscriptions: new Map(),
    invoices: new Map(),
    accounts: new Map(),
    refunds: [],
    events: [],
    identity: new Map(),
    redacted: [],
  }

  // Sends one signed event to the app, the way Stripe does, and reports the answer.
  async function deliver(type, object) {
    const event = { id: id("evt"), object: "event", type, created: now(), livemode: false, data: { object } }
    state.events.push(event)
    const payload = JSON.stringify(event)
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
    const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature }, body: payload })
    return { status: response.status, event }
  }

  // Sends an event again, byte for byte, as Stripe does when it retries.
  async function redeliver(event) {
    const payload = JSON.stringify(event)
    const signature = signer.webhooks.generateTestHeaderString({ payload, secret: webhookSecret })
    const response = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": signature }, body: payload })
    return response.status
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", origin)
      const method = request.method ?? "GET"
      const path = url.pathname

      if (method === "GET" && path.startsWith("/v1/prices/")) {
        const priceId = decodeURIComponent(path.slice("/v1/prices/".length))
        const verified = priceId.includes("verified")
        return send(response, 200, { id: priceId, object: "price", currency: "usd", unit_amount: verified ? 299 : 499, recurring: { interval: "month" } })
      }

      if (method === "POST" && path === "/v1/checkout/sessions") {
        const body = parseForm(await readBody(request))
        const sessionId = id("cs")
        const session = {
          id: sessionId,
          object: "checkout.session",
          mode: body.mode,
          client_reference_id: body.client_reference_id ?? null,
          customer: body.customer ?? null,
          customer_email: body.customer_email ?? null,
          metadata: body.metadata ?? {},
          subscription_data: body.subscription_data ?? null,
          payment_intent_data: body.payment_intent_data ?? null,
          line_items: body.line_items ?? {},
          success_url: body.success_url,
          cancel_url: body.cancel_url,
          url: `${origin}/pay/${sessionId}`,
          amount_total: body.line_items?.["0"]?.price_data?.unit_amount ? Number(body.line_items["0"].price_data.unit_amount) : null,
          currency: body.line_items?.["0"]?.price_data?.currency ?? "usd",
        }
        if (body.mode === "subscription") {
          const price = body.line_items?.["0"]?.price
          session.amount_total = price?.includes("verified") ? 299 : 499
          session.currency = "usd"
        }
        state.sessions.set(sessionId, session)
        return send(response, 200, session)
      }

      if (method === "GET" && path === "/v1/subscriptions") {
        const customer = url.searchParams.get("customer")
        const data = [...state.subscriptions.values()].filter((sub) => !customer || sub.customer === customer)
        return send(response, 200, { object: "list", data, has_more: false })
      }

      if (method === "GET" && path.startsWith("/v1/checkout/sessions/")) {
        const session = state.sessions.get(decodeURIComponent(path.slice("/v1/checkout/sessions/".length)))
        if (!session) return send(response, 404, { error: { type: "invalid_request_error", message: "No such checkout session." } })
        // The subscription comes back in full, as the request asks for it to be expanded.
        const subscription = session.subscription ? state.subscriptions.get(session.subscription) : undefined
        return send(response, 200, { ...session, subscription: subscription ?? null })
      }

      if (method === "GET" && path.startsWith("/pay/")) {
        const session = state.sessions.get(path.slice("/pay/".length))
        if (!session) return send(response, 404, "No such checkout.", "text/plain")
        const label = session.mode === "subscription" ? "Subscribe" : "Pay"
        return send(
          response,
          200,
          `<!doctype html><meta charset="utf-8"><title>Stripe test checkout</title><h1>Stripe test checkout</h1><p>${session.mode === "subscription" ? "Subscription" : "One-time payment"}</p><form method="post" action="/pay/${session.id}/complete"><button type="submit">${label}</button></form>`,
          "text/html"
        )
      }

      if (method === "POST" && path.startsWith("/pay/") && path.endsWith("/complete")) {
        const sessionId = path.slice("/pay/".length, -"/complete".length)
        const session = state.sessions.get(sessionId)
        if (!session) return send(response, 404, "No such checkout.", "text/plain")
        if (session.mode === "subscription") {
          const subscriptionId = id("sub")
          const customer = session.customer ?? id("cus")
          const periodEnd = now() + 30 * 24 * 3600
          const subscription = {
            id: subscriptionId,
            object: "subscription",
            customer,
            status: "active",
            cancel_at_period_end: false,
            created: now(),
            metadata: session.subscription_data?.metadata ?? {},
            items: { object: "list", data: [{ price: { id: session.line_items?.["0"]?.price }, current_period_end: periodEnd }] },
          }
          state.subscriptions.set(subscriptionId, subscription)
          const invoice = { id: id("in"), object: "invoice", subscription: subscriptionId, status: "paid", amount_paid: session.amount_total, payment_intent: id("pi") }
          state.invoices.set(subscriptionId, invoice)
          session.customer = customer
          session.subscription = subscriptionId
          await deliver("checkout.session.completed", { ...session, payment_status: "paid" })
          await deliver("customer.subscription.created", subscription)
        } else {
          const intent = id("pi")
          session.payment_intent = intent
          await deliver("checkout.session.completed", { ...session, payment_status: "paid", payment_intent: intent, amount_total: session.amount_total })
        }
        // Stripe fills the checkout id into the return address, as it does on the real site.
        response.writeHead(302, { Location: String(session.success_url).replace("{CHECKOUT_SESSION_ID}", session.id) })
        return response.end()
      }

      if (method === "POST" && path === "/v1/billing_portal/sessions") {
        await readBody(request)
        return send(response, 200, { id: id("bps"), object: "billing_portal.session", url: `${origin}/portal` })
      }

      if (method === "GET" && path === "/portal") {
        return send(response, 200, "<!doctype html><title>Stripe test portal</title><p>Billing portal (test).</p>", "text/html")
      }

      if (method === "POST" && path === "/v1/accounts") {
        const body = parseForm(await readBody(request))
        const account = { id: id("acct"), object: "account", type: body.type, country: body.country, charges_enabled: false, payouts_enabled: false }
        state.accounts.set(account.id, account)
        return send(response, 200, account)
      }

      if (method === "POST" && path === "/v1/account_links") {
        const body = parseForm(await readBody(request))
        return send(response, 200, {
          object: "account_link",
          url: `${origin}/finish/${encodeURIComponent(body.account)}?return=${encodeURIComponent(body.return_url)}`,
        })
      }

      if (method === "GET" && path.startsWith("/finish/")) {
        const accountId = decodeURIComponent(path.slice("/finish/".length))
        const account = state.accounts.get(accountId)
        if (!account) return send(response, 404, "No such account.", "text/plain")
        account.charges_enabled = true
        account.payouts_enabled = true
        await deliver("account.updated", account)
        response.writeHead(302, { Location: url.searchParams.get("return") ?? origin })
        return response.end()
      }

      // Stripe cancels a subscription at once with DELETE, and changes one with POST.
      const subMatch = path.match(/^\/v1\/subscriptions\/([^/]+)$/)
      if ((method === "POST" || method === "DELETE") && subMatch) {
        const subscription = state.subscriptions.get(subMatch[1])
        if (!subscription) return send(response, 404, { error: { message: "No such subscription." } })
        const body = parseForm(await readBody(request))
        if (method === "DELETE") {
          subscription.status = "canceled"
          subscription.cancel_at_period_end = false
        } else if (body.cancel_at_period_end !== undefined) {
          subscription.cancel_at_period_end = body.cancel_at_period_end === "true"
        }
        return send(response, 200, subscription)
      }

      if (method === "GET" && path === "/v1/invoices") {
        const subscriptionId = url.searchParams.get("subscription") ?? ""
        const invoice = state.invoices.get(subscriptionId)
        return send(response, 200, { object: "list", data: invoice ? [invoice] : [] })
      }

      if (method === "POST" && path === "/v1/refunds") {
        const body = parseForm(await readBody(request))
        const refund = { id: id("re"), object: "refund", status: "succeeded", payment_intent: body.payment_intent }
        state.refunds.push(refund)
        return send(response, 200, refund)
      }

      // Stripe Identity: a document check. The hosted page below stands in for Stripe's own. Its result is sent to the app as
      // the same signed event Stripe sends, and the person is returned to the app's return address.
      if (method === "POST" && path === "/v1/identity/verification_sessions") {
        const body = parseForm(await readBody(request))
        const sessionId = id("vs")
        const session = {
          id: sessionId,
          object: "identity.verification_session",
          type: body.type ?? "document",
          status: "requires_input",
          url: `${origin}/verify/${sessionId}`,
          return_url: body.return_url,
          metadata: body.metadata ?? {},
          options: body.options ?? {},
          verified_outputs: null,
        }
        state.identity.set(sessionId, session)
        return send(response, 200, session)
      }

      const verifyMatch = path.match(/^\/v1\/identity\/verification_sessions\/([^/]+)(\/redact)?$/)
      if (verifyMatch && method === "GET" && !verifyMatch[2]) {
        const session = state.identity.get(verifyMatch[1])
        if (!session) return send(response, 404, { error: { message: "No such verification session." } })
        // Stripe returns the date of birth only when the request asks to expand it.
        const expanded = [...url.searchParams.entries()].some(([key, value]) => key.startsWith("expand") && value === "verified_outputs")
        return send(response, 200, { ...session, verified_outputs: expanded ? session.verified_outputs : null })
      }
      if (verifyMatch && method === "POST" && verifyMatch[2]) {
        const session = state.identity.get(verifyMatch[1])
        if (!session) return send(response, 404, { error: { message: "No such verification session." } })
        // Stripe refuses to redact a session it is still checking, and the app only asks once a result is in.
        if (session.status !== "verified" && session.status !== "requires_input" && session.status !== "canceled") {
          return send(response, 400, { error: { message: "This verification session is still being processed." } })
        }
        session.verified_outputs = null
        session.redacted = true
        state.redacted.push(session.id)
        return send(response, 200, session)
      }

      if (method === "GET" && /^\/verify\/[^/]+$/.test(path)) {
        const session = state.identity.get(path.slice("/verify/".length))
        if (!session) return send(response, 404, "No such check.", "text/plain")
        return send(
          response,
          200,
          `<!doctype html><meta charset="utf-8"><title>Stripe test identity check</title><h1>Stripe test identity check</h1><p>Choose the result this check returns.</p><form method="post" action="/verify/${session.id}/complete?result=adult"><button type="submit">Verify as an adult</button></form><form method="post" action="/verify/${session.id}/complete?result=minor"><button type="submit">Verify as under 18</button></form>`,
          "text/html"
        )
      }

      const completeMatch = path.match(/^\/verify\/([^/]+)\/complete$/)
      if (method === "POST" && completeMatch) {
        const session = state.identity.get(completeMatch[1])
        if (!session) return send(response, 404, "No such check.", "text/plain")
        const minor = url.searchParams.get("result") === "minor"
        const today = new Date()
        // A minor is 15 today, and an adult was born in 1990. The date of birth is what the app reads, never stored by it.
        // Stripe returns the date under verified_outputs.dob (see the SDK's VerificationSession types).
        session.verified_outputs = {
          dob: minor
            ? { year: today.getUTCFullYear() - 15, month: today.getUTCMonth() + 1, day: today.getUTCDate() }
            : { year: 1990, month: 4, day: 9 },
        }
        session.status = "verified"
        await deliver("identity.verification_session.verified", session)
        response.writeHead(302, { Location: session.return_url })
        return response.end()
      }

      return send(response, 404, { error: { message: `The test Stripe does not implement ${method} ${path}.` } })
    } catch (error) {
      return send(response, 500, { error: { message: String(error && error.message) } })
    }
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })

  return {
    state,
    deliver,
    redeliver,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}
