// A local mail sink for the end-to-end suite. When the server sends mail through SMTP (RHENKO_SMTP_URL), a test run points it
// here instead of a real mail server, so nothing leaves the machine. Each message is written to MAIL_LOG as the
// "[mail] to <address>: <subject>" block that e2e/lib/mail.mjs reads: one block per recipient, then the text.
//
//   MAIL_LOG=/path/to/mail.log node e2e/lib/mail-sink.mjs
//
// It listens on 127.0.0.1 at MAIL_SINK_PORT (default 2525). Point the server and the suite at it with the same values:
//   RHENKO_SMTP_URL=smtp://127.0.0.1:2525      (the server)
//   MAIL_LOG=/path/to/mail.log                 (the suite, and this sink)
//
// It speaks the part of SMTP that nodemailer uses on a plain connection: EHLO, HELO, MAIL, RCPT, DATA, RSET, NOOP and QUIT.
// It does not offer STARTTLS or AUTH, so an SMTP URL that asks for either will not connect.
import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HOST = "127.0.0.1"
const DEFAULT_PORT = 2525
// A client that goes quiet this long is dropped, so a stuck test cannot hold the port open.
const IDLE_MS = 120_000

// ---------------------------------------------------------------------------------------------------------------------
// Reading a message
// ---------------------------------------------------------------------------------------------------------------------

// The subject and the plain-text body of a raw message. Line endings may be CRLF or LF. A message with no plain-text part
// has an empty body.
export function parseMessage(raw) {
  const text = raw.replace(/\r\n/g, "\n")
  const headers = parseHeaders(splitMessage(text).headerText)
  const subject = decodeHeader(headers.get("subject") || "").trim()
  const body = (plainTextOf(text) ?? "").replace(/\n+$/, "")
  return { subject, body }
}

// Header text and body text, split at the first blank line.
function splitMessage(text) {
  if (text.startsWith("\n")) return { headerText: "", body: text.slice(1) }
  const end = text.indexOf("\n\n")
  if (end === -1) return { headerText: text, body: "" }
  return { headerText: text.slice(0, end), body: text.slice(end + 2) }
}

// Header names mapped to their values, lowercase names. A header that repeats keeps its first value. A folded line (one that
// starts with a space or tab) continues the header above it.
function parseHeaders(headerText) {
  const headers = new Map()
  let current = null
  for (const line of headerText.split("\n")) {
    if (/^[ \t]/.test(line)) {
      if (current !== null) headers.set(current, `${headers.get(current)} ${line.trim()}`)
      continue
    }
    current = null
    const colon = line.indexOf(":")
    if (colon <= 0) continue
    const name = line.slice(0, colon).trim().toLowerCase()
    if (headers.has(name)) continue
    headers.set(name, line.slice(colon + 1).trim())
    current = name
  }
  return headers
}

// "text/plain; charset=utf-8" becomes its type and its parameters, with the parameter names in lowercase.
function parseContentType(value) {
  const [first = "", ...rest] = value.split(";")
  const type = first.trim().toLowerCase() || "text/plain"
  const params = {}
  for (const part of rest) {
    const equals = part.indexOf("=")
    if (equals === -1) continue
    params[part.slice(0, equals).trim().toLowerCase()] = part.slice(equals + 1).trim().replace(/^"|"$/g, "")
  }
  return { type, params }
}

// The text of the first text/plain part, looking inside multipart parts in order. Attachments are skipped. Null when there is none.
function plainTextOf(raw) {
  const { headerText, body } = splitMessage(raw)
  const headers = parseHeaders(headerText)
  const { type, params } = parseContentType(headers.get("content-type") || "")
  if ((headers.get("content-disposition") || "").trim().toLowerCase().startsWith("attachment")) return null
  if (type.startsWith("multipart/")) {
    if (!params.boundary) return null
    for (const part of multipartParts(body, params.boundary)) {
      const found = plainTextOf(part)
      if (found !== null) return found
    }
    return null
  }
  if (type !== "text/plain") return null
  return decodeBody(body, headers.get("content-transfer-encoding") || "", params.charset)
}

// The parts of a multipart body, each as its own raw message (headers and body), in the order they appear.
function multipartParts(body, boundary) {
  const delimiter = `--${boundary}`
  const parts = []
  let current = null
  for (const line of body.split("\n")) {
    const marker = line.trimEnd()
    if (marker === delimiter || marker === `${delimiter}--`) {
      if (current !== null) parts.push(current.join("\n"))
      current = marker === delimiter ? [] : null
    } else if (current !== null) {
      current.push(line)
    }
  }
  return parts
}

function decodeBody(body, encoding, charset) {
  const how = encoding.trim().toLowerCase()
  if (how === "base64") return decodeBytes(Buffer.from(body.replace(/\s+/g, ""), "base64"), charset)
  if (how === "quoted-printable") return decodeBytes(quotedPrintableBytes(body), charset)
  return body
}

// The bytes of quoted-printable text. =XX is one byte; a line that ends in = joins with the next line; anything else is
// its own UTF-8 bytes.
function quotedPrintableBytes(text) {
  const chunks = []
  const lines = text.split("\n")
  lines.forEach((line, index) => {
    const soft = line.endsWith("=")
    const content = soft ? line.slice(0, -1) : line.replace(/[ \t]+$/, "")
    chunks.push(escapedBytes(content))
    if (!soft && index < lines.length - 1) chunks.push(Buffer.from("\n", "utf8"))
  })
  return Buffer.concat(chunks)
}

// Text with =XX escapes turned into bytes, and everything else kept as its UTF-8 bytes.
function escapedBytes(text) {
  const pieces = text.split(/(=[0-9A-Fa-f]{2})/).filter((piece) => piece !== "")
  return Buffer.concat(
    pieces.map((piece) => (/^=[0-9A-Fa-f]{2}$/.test(piece) ? Buffer.from([parseInt(piece.slice(1), 16)]) : Buffer.from(piece, "utf8")))
  )
}

// Decodes bytes with the charset named in the message. Falls back to UTF-8 for a charset this runtime does not know.
function decodeBytes(bytes, charset = "") {
  const label = charset.split("*")[0].trim() || "utf-8"
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return bytes.toString("utf8")
  }
}

// Decodes RFC 2047 encoded words in a header value, such as =?UTF-8?B?...?= or =?UTF-8?Q?Caf=C3=A9?=.
function decodeHeader(value) {
  return value
    .replace(/(=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g, (_, charset, how, text) => {
      const bytes = how.toUpperCase() === "B" ? Buffer.from(text, "base64") : escapedBytes(text.replace(/_/g, " "))
      return decodeBytes(bytes, charset)
    })
}

// ---------------------------------------------------------------------------------------------------------------------
// The sink: a small SMTP server that writes what it receives to the log
// ---------------------------------------------------------------------------------------------------------------------

// A server that is not listening yet. Each connection is one SMTP session; every message that completes is appended to
// logFile, one block per recipient.
export function createSink({ logFile }) {
  return net.createServer((socket) => {
    const session = { mailFrom: false, recipients: [], data: null, pending: "", closed: false }
    socket.setEncoding("utf8")
    socket.setTimeout(IDLE_MS, () => socket.destroy())
    socket.on("error", () => {})
    socket.on("data", (chunk) => {
      session.pending += chunk
      for (;;) {
        const end = session.pending.indexOf("\n")
        if (end === -1 || session.closed) break
        const line = session.pending.slice(0, end).replace(/\r$/, "")
        session.pending = session.pending.slice(end + 1)
        handleLine(socket, session, line, logFile)
      }
    })
    socket.write(`220 ${HOST} rhenko mail sink ready\r\n`)
  })
}

function handleLine(socket, session, line, logFile) {
  const reply = (text) => socket.write(`${text}\r\n`)

  if (session.data !== null) {
    if (line !== ".") {
      // A line that starts with a dot was doubled by the sender.
      session.data.push(line.startsWith("..") ? line.slice(1) : line)
      return
    }
    const raw = session.data.join("\n")
    session.data = null
    try {
      record(logFile, session.recipients, raw)
      reply("250 2.0.0 OK, message logged")
    } catch (error) {
      reply(`451 4.3.0 the mail log cannot be written: ${error.message}`)
    }
    session.mailFrom = false
    session.recipients = []
    return
  }

  const command = line.trim()
  const [word = ""] = command.split(/\s+/)
  switch (word.toUpperCase()) {
    case "EHLO":
    case "HELO":
      return reply(`250 ${HOST}`)
    case "MAIL":
      if (!/^MAIL FROM:/i.test(command)) return reply("501 5.5.4 MAIL needs FROM:<address>")
      session.mailFrom = true
      session.recipients = []
      return reply("250 2.1.0 OK")
    case "RCPT": {
      if (!session.mailFrom) return reply("503 5.5.1 MAIL comes first")
      const match = /^RCPT TO:\s*<([^>]*)>/i.exec(command)
      if (!match || match[1].trim() === "") return reply("501 5.1.3 RCPT needs TO:<address>")
      session.recipients.push(match[1].trim())
      return reply("250 2.1.5 OK")
    }
    case "DATA":
      if (session.recipients.length === 0) return reply("503 5.5.1 RCPT comes first")
      session.data = []
      return reply("354 End data with <CR><LF>.<CR><LF>")
    case "RSET":
      session.mailFrom = false
      session.recipients = []
      return reply("250 2.0.0 OK")
    case "NOOP":
      return reply("250 2.0.0 OK")
    case "QUIT":
      reply("221 2.0.0 bye")
      session.closed = true
      socket.end()
      return
    default:
      return reply("502 5.5.2 command not recognized")
  }
}

function record(logFile, recipients, raw) {
  const { subject, body } = parseMessage(raw)
  const block = recipients.map((to) => `[mail] to ${to}: ${subject}\n${body}\n`).join("")
  fs.appendFileSync(logFile, block, "utf8")
}

// ---------------------------------------------------------------------------------------------------------------------
// Started from the command line
// ---------------------------------------------------------------------------------------------------------------------

function listenFromEnvironment() {
  const logFile = process.env.MAIL_LOG
  if (!logFile) {
    console.error("Set MAIL_LOG to the file the sink writes its log to, for example MAIL_LOG=/tmp/mail.log.")
    process.exit(2)
  }
  const port = Number(process.env.MAIL_SINK_PORT || DEFAULT_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`MAIL_SINK_PORT must be a port number from 1 to 65535, not ${process.env.MAIL_SINK_PORT}.`)
    process.exit(2)
  }
  const server = createSink({ logFile })
  server.on("error", (error) => {
    console.error(`The mail sink cannot listen on ${HOST}:${port}: ${error.message}`)
    process.exit(2)
  })
  server.listen(port, HOST, () => console.log(`mail sink listening on ${HOST}:${port}, writing ${logFile}`))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) listenFromEnvironment()
