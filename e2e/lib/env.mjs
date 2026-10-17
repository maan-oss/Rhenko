// Settings read from the environment, and the small helpers every file shares.
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes, randomInt } from "node:crypto"

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

// Where the app answers.
export const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "")
// Where screenshots of failures go.
export const OUT = process.env.OUT || path.join(os.tmpdir(), "rhenko-e2e")
// The file the server writes its output to. The mail reader looks for "[mail]" lines in it.
export const SERVER_LOG = process.env.SERVER_LOG || ""
// A file that holds mail in the same "[mail] to <address>: <subject>" format. When the server sends mail through SMTP, point
// this at the log of the local mail sink (scripts/smtp-sink or the one used for the run). Defaults to SERVER_LOG.
export const MAIL_LOG = process.env.MAIL_LOG || SERVER_LOG
// A Chromium to launch. Empty means the one Playwright installed.
export const CHROMIUM_PATH = process.env.CHROMIUM_PATH || ""
// The folder the server keeps uploads in when RHENKO_STORAGE=local. The link preview check stores its picture there.
export const DATA_DIR = process.env.RHENKO_DATA_DIR || path.join(REPO_ROOT, "data")
// Run only some areas, for example ONLY=auth,posts.
export const ONLY = (process.env.ONLY || "")
  .split(",")
  .map((part) => part.trim().toLowerCase())
  .filter(Boolean)

// How long one wait for something on a page may take, in milliseconds. A server that compiles pages as it goes (next dev) may need more.
export const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS) || 20_000

export const DESKTOP = { width: 1440, height: 900 }
export const PHONE = { width: 390, height: 844 }

export const PASSWORD = "Correct-horse-9"

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz"
const DIGITS = "0123456789"

// A random run of lowercase letters and digits.
export function randomWord(length, alphabet = LETTERS + DIGITS) {
  let out = ""
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}

// One id for the whole run, so every account and post this run makes can be told apart.
export const RUN_ID = randomWord(4, LETTERS) + randomWord(2, DIGITS)

// A handle that passes the rules in lib/rules.ts: 3 to 15 characters, letters digits and underscores, at least 3 letters.
// A short role tag (up to 5 letters), the run id (4 letters and 2 digits) and 3 random characters: 14 characters at most.
export function randomHandle(tag = "u") {
  return `${tag.slice(0, 5)}${RUN_ID}${randomWord(3)}`
}

// A fake client address for one browser. Servers that read x-forwarded-for or x-real-ip count limits per address,
// so each account looks like its own visitor.
export function randomAddress() {
  const bytes = randomBytes(3)
  return `10.${bytes[0]}.${bytes[1]}.${(bytes[2] % 253) + 1}`
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// A file-name-safe version of a check name.
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}
