// Unit checks for the local mail sink the end-to-end suite uses (e2e/lib/mail-sink.mjs): how a message's subject and plain-text
// body are read, and that a full SMTP session writes the "[mail] to ..." blocks the suite reads.
// Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { createSink, parseMessage } from "../e2e/lib/mail-sink.mjs"

test("a plain message gives its subject and its body", () => {
  const raw = ["From: a@example.com", "To: b@example.com", "Subject: Your code", "", "Your code is 123456.", ""].join("\r\n")
  assert.deepEqual(parseMessage(raw), { subject: "Your code", body: "Your code is 123456." })
})

test("a folded subject is joined, and encoded words are decoded", () => {
  const folded = ["Subject: Your", "  code", "", "body"].join("\n")
  assert.equal(parseMessage(folded).subject, "Your code")

  const base64Subject = `Subject: =?UTF-8?B?${Buffer.from("Bienvenue à Rhenko").toString("base64")}?=`
  assert.equal(parseMessage(`${base64Subject}\n\nbody`).subject, "Bienvenue à Rhenko")

  const quotedSubject = "Subject: =?UTF-8?Q?Caf=C3=A9_menu?="
  assert.equal(parseMessage(`${quotedSubject}\n\nbody`).subject, "Café menu")
})

test("a multipart message gives its text part, decoded from quoted-printable", () => {
  const raw = [
    "Subject: Sign in",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Caf=C3=A9 code 654321=",
    " is ready",
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>html 000000</p>",
    "--b1--",
    "",
  ].join("\n")
  assert.deepEqual(parseMessage(raw), { subject: "Sign in", body: "Café code 654321 is ready" })
})

test("a base64 text part is decoded", () => {
  const raw = [
    "Subject: Code",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("Your code: 000111").toString("base64"),
    "",
  ].join("\n")
  assert.equal(parseMessage(raw).body, "Your code: 000111")
})

test("an attachment is skipped in favour of the message's own text", () => {
  const raw = [
    "Subject: Files",
    'Content-Type: multipart/mixed; boundary="m1"',
    "",
    "--m1",
    'Content-Type: text/plain; name="notes.txt"',
    'Content-Disposition: attachment; filename="notes.txt"',
    "",
    "secret 999999",
    "--m1",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Your code 123456",
    "--m1--",
    "",
  ].join("\n")
  assert.equal(parseMessage(raw).body, "Your code 123456")
})

test("a message with no plain-text part has an empty body", () => {
  const raw = ["Subject: Only html", "Content-Type: text/html", "", "<p>123456</p>"].join("\n")
  assert.deepEqual(parseMessage(raw), { subject: "Only html", body: "" })
})

test("an SMTP session writes one block per recipient, undoes dot-stuffing, and answers each step", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mail-sink-"))
  const logFile = path.join(dir, "mail.log")
  const server = createSink({ logFile })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  try {
    const commands = [
      "EHLO test.local",
      "RCPT TO:<reader@example.com>", // before MAIL: refused with 503
      "MAIL FROM:<no-reply@localhost>",
      "RCPT TO:<reader@example.com>",
      "RCPT TO:<second@example.com>",
      "DATA",
      "Subject: Your code",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Use 246810 to sign in.",
      "..A line that starts with a dot.",
      ".",
      "RSET",
      "MAIL FROM:<no-reply@localhost>",
      "RCPT TO:<third@example.com>",
      "DATA",
      "Subject: Second",
      "",
      "Second body",
      ".",
      "NOOP",
      "BOGUS",
      "QUIT",
    ]
    const transcript = await new Promise((resolve, reject) => {
      const socket = net.connect(port, "127.0.0.1")
      let output = ""
      socket.setEncoding("utf8")
      socket.on("data", (chunk) => {
        output += chunk
      })
      socket.on("error", reject)
      socket.on("close", () => resolve(output))
      socket.write(commands.map((command) => `${command}\r\n`).join(""))
    })

    assert.match(transcript, /^220 /)
    assert.match(transcript, /503 /, "RCPT before MAIL is refused")
    assert.match(transcript, /354 /, "DATA is accepted")
    assert.match(transcript, /502 /, "an unknown command is refused")
    assert.match(transcript, /221 /, "QUIT is answered")

    assert.equal(
      fs.readFileSync(logFile, "utf8"),
      [
        "[mail] to reader@example.com: Your code\nUse 246810 to sign in.\n.A line that starts with a dot.\n",
        "[mail] to second@example.com: Your code\nUse 246810 to sign in.\n.A line that starts with a dot.\n",
        "[mail] to third@example.com: Second\nSecond body\n",
      ].join("")
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
