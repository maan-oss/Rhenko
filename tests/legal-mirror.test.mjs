// Some numbers are written twice on purpose: the app reads lib/legal.ts, and the command line (scripts/legal.mjs) runs without the
// app's build. This test keeps the repeat-infringer numbers the same in both, so the command line counts what the policy says.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (path) => readFileSync(join(root, path), "utf8")

test("the repeat-infringer numbers match between lib/legal.ts and scripts/legal.mjs", () => {
  const app = read("lib/legal.ts")
  const cli = read("scripts/legal.mjs")

  const notices = app.match(/export const REPEAT_INFRINGER_NOTICES = (\d+)/)
  const days = app.match(/export const REPEAT_INFRINGER_DAYS = (\d+)/)
  assert.ok(notices && days, "lib/legal.ts has no repeat-infringer numbers")

  const strikes = cli.match(/const REPEAT_STRIKES = (\d+)/)
  const windowMs = cli.match(/const REPEAT_WINDOW_MS = (\d+) \* 24 \* 60 \* 60 \* 1000/)
  assert.ok(strikes && windowMs, "scripts/legal.mjs has no repeat-infringer numbers")

  assert.equal(Number(strikes[1]), Number(notices[1]), "upheld notices before review differ")
  assert.equal(Number(windowMs[1]), Number(days[1]), "the 12-month window differs")
})
