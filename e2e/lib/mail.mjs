// Reads the six-digit codes the server mails out. Either the server prints them (no mail server is set, outside production)
// into the file named by SERVER_LOG, or it sends them through SMTP to a local sink whose log is named by MAIL_LOG. Each
// message is a "[mail] to <address>: <subject>" line followed by the text.
import fs from "node:fs"
import { MAIL_LOG, sleep } from "./env.mjs"

function sizeOfLog() {
  try {
    return fs.statSync(MAIL_LOG).size
  } catch {
    return 0
  }
}

// A sink creates its log on the first message it receives, so a log that does not exist yet is empty, not missing. The file is
// created here (append mode, so nothing already in it is lost) so the suite can start watching it before the first mail.
export function mailReadable() {
  if (!MAIL_LOG) return "No mail log is set. Set MAIL_LOG to the mail sink's log, or SERVER_LOG to the server's output when it prints mail."
  try {
    fs.closeSync(fs.openSync(MAIL_LOG, "a"))
  } catch (error) {
    return `The mail log ${MAIL_LOG} cannot be written: ${error.message}`
  }
  return null
}

// Call this just before doing the thing that sends mail. Codes already in the log before this point are ignored.
export function markLog() {
  const problem = mailReadable()
  if (problem) throw new Error(problem)
  return sizeOfLog()
}

function messagesAfter(offset) {
  const fd = fs.openSync(MAIL_LOG, "r")
  try {
    const size = fs.fstatSync(fd).size
    if (size <= offset) return []
    const buffer = Buffer.alloc(size - offset)
    fs.readSync(fd, buffer, 0, buffer.length, offset)
    const text = buffer.toString("utf8")
    const parts = text.split(/^\[mail\] to /m).slice(1)
    return parts.map((part) => {
      const lineEnd = part.indexOf("\n")
      const header = lineEnd === -1 ? part : part.slice(0, lineEnd)
      const body = lineEnd === -1 ? "" : part.slice(lineEnd + 1)
      const colon = header.indexOf(": ")
      return { to: header.slice(0, colon).trim().toLowerCase(), subject: header.slice(colon + 2).trim(), body }
    })
  } finally {
    fs.closeSync(fd)
  }
}

// The newest code mailed to `address` after `mark`. Waits for the mail to appear.
export async function mailedCode(address, mark, { timeoutMs = 20_000, subject } = {}) {
  const wanted = address.toLowerCase()
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const found = messagesAfter(mark).filter((message) => message.to === wanted && (!subject || subject.test(message.subject)))
    if (found.length > 0) {
      const newest = found[found.length - 1]
      // The body comes first. The subject is the fallback for a template that puts the code there.
      const code = /(?<![\d])(\d{6})(?![\d])/.exec(newest.body) || /(?<![\d])(\d{6})(?![\d])/.exec(newest.subject)
      if (code) return { code: code[1], subject: newest.subject, body: newest.body }
    }
    await sleep(300)
  }
  throw new Error(`no mail with a six-digit code for ${address} reached the mail log (${MAIL_LOG}) within ${Math.round(timeoutMs / 1000)} seconds`)
}

// How many messages to this address appeared after the mark. Used to check that no mail went out.
export function mailCount(address, mark) {
  const wanted = address.toLowerCase()
  return messagesAfter(mark).filter((message) => message.to === wanted).length
}
