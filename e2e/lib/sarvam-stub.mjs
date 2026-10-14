// A stand-in for the Sarvam chat completions service, for e2e/sahayak.mjs. Start it, then start the server with
// RHENKO_SARVAM_KEY=<any value> and RHENKO_SARVAM_URL=http://127.0.0.1:<port>/v1/chat/completions, and run the suite with
// E2E_SAHAYAK=1. It answers POST /v1/chat/completions with the question it was given, marked as its answer, so the check
// can see the answer came from the service, and how many posts came before the question. A question containing "[fail]" gets a 500 every time, so the check can see a
// retry being scheduled. It refuses a request without the subscription key, and it logs one line per request without the
// text, so the log can't leak what people asked.
//
//   node e2e/lib/sarvam-stub.mjs          (port: SARVAM_STUB_PORT, default 5520)
import http from "node:http"

const PORT = Number(process.env.SARVAM_STUB_PORT) || 5520
const KEY = "e2e-sarvam-key"

const server = http.createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }))
    return
  }
  let body = ""
  request.on("data", (chunk) => {
    body += chunk
    if (body.length > 200_000) request.destroy()
  })
  request.on("end", () => {
    if (request.headers["api-subscription-key"] !== KEY || request.headers.authorization !== `Bearer ${KEY}`) {
      console.log("[sarvam-stub] refused a request with the wrong key")
      response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "unauthorized" }))
      return
    }
    let input
    try {
      input = JSON.parse(body)
    } catch {
      response.writeHead(400).end()
      return
    }
    const messages = Array.isArray(input.messages) ? input.messages : []
    const user = messages.filter((message) => message.role === "user").at(-1)?.content ?? ""
    console.log(
      `[sarvam-stub] model=${input.model} messages=${messages.length} max_tokens=${input.max_tokens} stream=${input.stream}`
    )
    if (user.includes("[fail]")) {
      response.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "stub failure" }))
      return
    }
    const question = user.split("Question: ").at(-1) ?? ""
    // The number of posts given as context, so the check can see the posts before a question were sent.
    const context = (user.match(/<post author=/g) ?? []).length
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        choices: [
          { index: 0, message: { role: "assistant", content: `Sahayak answer to: ${question} (context posts: ${context})` } },
        ],
      })
    )
  })
})

server.listen(PORT, "127.0.0.1", () => console.log(`Sarvam stub on http://127.0.0.1:${PORT}/v1/chat/completions`))
