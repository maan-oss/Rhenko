// The check runner: runs one check, prints PASS or FAIL, saves screenshots on failure, and totals everything up.
import assert from "node:assert/strict"
import { closeAllVisitors } from "./browser.mjs"
import { problemMark, problemsSince, settleWatchers, shootAll } from "./watch.mjs"

const results = []
let currentArea = "suite"
const CHECK_LIMIT_MS = 4 * 60 * 1000

export { assert }

export function area(name) {
  currentArea = name
  console.log(`\n== ${name}`)
}

// A line of progress inside a long check, for example a wait that takes half a minute.
export function note(message) {
  console.log(`      ... ${message}`)
}

// Stops a check with a plain reason when something an earlier check should have made is missing.
export function need(value, what) {
  if (value === undefined || value === null || value === false) {
    throw new Error(`needs ${what}, which an earlier check did not produce`)
  }
  return value
}

export function fail(message) {
  throw new Error(message)
}

// The first lines of an error. Playwright adds a long call log; the first few lines say what was being waited for.
function trimmed(error) {
  const text = error && error.message ? String(error.message) : String(error)
  const lines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
  return lines.slice(0, 9).join("\n")
}

function withLimit(promise, label) {
  let timer
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`took longer than ${CHECK_LIMIT_MS / 1000} seconds: ${label}`)), CHECK_LIMIT_MS)
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}

function describe(problem) {
  const where = `${problem.viewport} ${problem.url}`
  if (problem.kind === "pageerror") return `uncaught page error (${where}): ${problem.text}`
  if (problem.kind === "console") return `console error (${where}): ${problem.text}`
  return `layout (${where}): ${problem.text}`
}

// Runs one check. The check passes when the function returns, nothing was thrown, and no page error,
// console error or overflow showed up on any page while it ran.
export async function check(name, fn) {
  const mark = problemMark()
  const started = Date.now()
  let failure = null
  try {
    await withLimit(Promise.resolve().then(fn), name)
  } catch (error) {
    failure = error
  }
  await settleWatchers()
  const problems = problemsSince(mark)
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const ok = failure === null && problems.length === 0
  const lines = []
  if (failure) lines.push(trimmed(failure))
  for (const problem of problems) lines.push(describe(problem))
  let shots = []
  if (!ok) shots = await shootAll(`${currentArea}-${name}`)
  results.push({ area: currentArea, name, ok, lines, shots })
  console.log(`${ok ? "PASS" : "FAIL"}  [${currentArea}] ${name} (${seconds}s)`)
  if (!ok) {
    for (const line of lines) console.log(`      ${line.replace(/\n/g, "\n      ")}`)
    for (const shot of shots) console.log(`      screenshot: ${shot}`)
  }
  return ok
}

// Runs a whole flow (its set-up and the checks inside it). If the flow stops because something it needed was missing,
// that is reported as one failed check, and the next flow still runs. Every browser the flow opened is closed at the end,
// after the pictures of a failure are taken.
export async function guard(name, fn) {
  const started = Date.now()
  try {
    await fn()
  } catch (error) {
    await settleWatchers()
    const label = `${name} (stopped before it finished)`
    const lines = [trimmed(error)]
    const shots = await shootAll(`${currentArea}-${name}`)
    results.push({ area: currentArea, name: label, ok: false, lines, shots })
    console.log(`FAIL  [${currentArea}] ${label} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
    for (const line of lines) console.log(`      ${line.replace(/\n/g, "\n      ")}`)
    for (const shot of shots) console.log(`      screenshot: ${shot}`)
  } finally {
    await closeAllVisitors()
  }
}

export function summary() {
  const failed = results.filter((result) => !result.ok)
  console.log("\n--------------------------------------------------------------")
  console.log(`${results.length - failed.length} passed, ${failed.length} failed, ${results.length} checks`)
  if (failed.length > 0) {
    console.log("\nFailed checks:")
    for (const result of failed) console.log(`  [${result.area}] ${result.name}`)
  }
  return { total: results.length, failed: failed.length }
}
