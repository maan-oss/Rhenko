// A stand-in for a translation service that speaks the LibreTranslate interface, for the translation check in
// e2e/connections.mjs. Start it, then start the server with RHENKO_TRANSLATE_URL=http://127.0.0.1:<port>, and run the
// suite with E2E_TRANSLATE=1. It answers POST /translate with the text marked with its languages, so the check can see
// that the text went through the service. It logs one line per request.
//
//   node e2e/lib/translate-stub.mjs          (port: TRANSLATE_STUB_PORT, default 5510)
import http from "node:http"

const PORT = Number(process.env.TRANSLATE_STUB_PORT) || 5510

const server = http.createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/translate") {
    response.writeHead(404, { "content-type": "application/json" })
    response.end(JSON.stringify({ error: "not found" }))
    return
  }
  let body = ""
  request.on("data", (chunk) => {
    body += chunk
    if (body.length > 100_000) request.destroy()
  })
  request.on("end", () => {
    let input
    try {
      input = JSON.parse(body)
    } catch {
      response.writeHead(400).end()
      return
    }
    console.log(`[stub] ${input.source} -> ${input.target}, ${String(input.q).length} characters`)
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ translatedText: `[${input.source}→${input.target}] ${input.q}` }))
  })
})

server.listen(PORT, "127.0.0.1", () => console.log(`translation stub on http://127.0.0.1:${PORT}`))
