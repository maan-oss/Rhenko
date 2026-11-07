// The file names that count as the app's own uploads. The app's code (lib/uploads.ts) decides which stored files it removes with a
// message. The command line (scripts/moderation.mjs) and the runbook's deletion SQL (docs/e2ee-switch-over-runbook.md) decide the same
// thing in their own copies. If one list is shorter, a voice note or a document is left in storage after its message is gone, so
// this test keeps the three the same.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path) => readFileSync(join(root, path), "utf8")

// The extensions alternation inside a `\.(a|b|c)$` pattern.
function extensionsOf(source) {
  const match = source.match(/\\\.\(([a-z0-9|]+)\)\$/)
  assert.ok(match, "no extension list found")
  return match[1].split("|")
}

test("the app's upload names are the same in the code, the command line and the runbook", () => {
  const app = read("lib/uploads.ts").match(/export const UPLOAD_NAME_PATTERN = (\/.*\/)$/m)
  assert.ok(app, "lib/uploads.ts has no UPLOAD_NAME_PATTERN")
  const commandLine = read("scripts/moderation.mjs").match(/^const UPLOAD_NAME = (\/.*\/)$/m)
  assert.ok(commandLine, "scripts/moderation.mjs has no UPLOAD_NAME")
  const runbook = read("docs/e2ee-switch-over-runbook.md").match(/where d\.media_file ~ '(\^\[a-f0-9\]\{32\}[^']*)'/)
  assert.ok(runbook, "the runbook's step 5 has no name pattern")

  const expected = extensionsOf(app[1])
  assert.ok(expected.includes("weba") && expected.includes("pdf"), "the app's list lost its audio or document types")
  assert.deepEqual(extensionsOf(commandLine[1]), expected, "scripts/moderation.mjs lists different upload types from lib/uploads.ts")
  assert.deepEqual(extensionsOf(runbook[1]), expected, "the runbook's step 5 lists different upload types from lib/uploads.ts")
})

test("the runbook's step 5 keeps a file that a chat report still holds", () => {
  const runbook = read("docs/e2ee-switch-over-runbook.md")
  assert.match(runbook, /and not exists \(select 1 from chat_report_files f where f\.file = d\.media_file\)/)
})
