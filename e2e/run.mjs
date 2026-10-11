#!/usr/bin/env node
// End-to-end browser test of the whole Rhenko product.
//
//   node e2e/run.mjs
//
// It drives a real Chromium against a server that is already running, with fresh accounts made for every run (random
// handles, so runs never collide and nothing needs cleaning up). Each check prints PASS or FAIL; a failure also saves a
// screenshot of every open page. At the end it prints a summary and exits with 1 if anything failed (2 if it could not start).
//
// Settings, all optional, read from the environment:
//   BASE_URL         where the server answers                          (default http://localhost:3000)
//   OUT              folder for screenshots of failures and upload fixtures   (default <tmp>/rhenko-e2e)
//   CHROMIUM_PATH    a Chromium to launch; empty means the one Playwright installed
//   SERVER_LOG       file the server's output goes to. The email checks read the verification and reset codes the
//                    server prints ("[mail] to ...") when no mail server is set up. That only happens when the server is
//                    not started in production mode.
//   MAIL_LOG         the log of a local mail sink, when the server sends through SMTP (RHENKO_SMTP_URL). The sink writes
//                    the same "[mail] to ..." lines. Defaults to SERVER_LOG. Without either, the email checks fail and say so.
//   RHENKO_DATA_DIR  folder the server keeps rhenko.sqlite in (same value the server got; default ./data). Used for exactly
//                    one step: moving a scheduled post to 30 seconds from now (see e2e/posts.mjs).
//   ONLY             run only some areas, for example ONLY=auth,posts
//   E2E_TIMEOUT_MS   how long one wait for something on a page may take (default 20000; raise it for a server that
//                    compiles pages as it goes)
//
// The server must run with RHENKO_TRUST_PROXY=1. Each browser sends its own fake client address in x-real-ip, and the
// rate limits count by that address only when the server is told a proxy sets it.
import { performance } from "node:perf_hooks"
import { BASE, CHROMIUM_PATH, DATA_DIR, MAIL_LOG, ONLY, OUT, TIMEOUT } from "./lib/env.mjs"
import { closeAllVisitors, closeBrowser, launchBrowser } from "./lib/browser.mjs"
import { area, check, fail, guard, summary } from "./lib/harness.mjs"
import { configureNoise, noiseTally } from "./lib/watch.mjs"
import * as auth from "./auth.mjs"
import * as posts from "./posts.mjs"
import * as social from "./social.mjs"
import * as messages from "./messages.mjs"
import * as calls from "./calls.mjs"
import * as settings from "./settings.mjs"
import * as visibility from "./visibility.mjs"
import * as account from "./account.mjs"

// ---------------------------------------------------------------------------------------------------------------------
// Console and page messages the suite does not count as failures. Everything else that the browser reports as a console
// error or an uncaught page error fails the check that was running. Each rule says why it is safe. The count of how often
// each one was used is printed at the end, so a rule that hides too much shows up.
// ---------------------------------------------------------------------------------------------------------------------
const IGNORED_NOISE = [
  {
    id: "page-that-must-answer-404",
    kind: "console",
    text: /Failed to load resource: the server responded with a status of 404/,
    // Only page loads: not pictures (/media/), scripts and styles (/_next/), the JSON routes (/api/), or the background
    // fetches of the client router (?_rsc=), which would be real broken links.
    url: /^https?:\/\/[^/]+\/(?!media\/|_next\/|api\/)(?!.*[?&]_rsc=)/,
    reason:
      "The suite opens pages that have to answer 404 (a post or profile the viewer may not see) and Chromium reports each of those page loads as a console error. The 404 itself is asserted by the check.",
  },
  {
    id: "stream-of-an-ended-session",
    kind: "console",
    text: /Failed to load resource: the server responded with a status of 401/,
    url: /\/api\/events(\?|$)/,
    reason:
      "A page whose session has just ended (signed out on another device, account deactivated or deleted) is refused by the live event stream while it is still open or on its way to the sign-in page. The sign-out and revoke checks assert the redirect itself.",
  },
  {
    id: "resize-observer-loop",
    kind: "pageerror",
    text: /^ResizeObserver loop (limit exceeded|completed with undelivered notifications)/,
    url: null,
    reason:
      "Chromium raises this window error when a resize observer callback changes layout again in the same frame (a textarea that grows as text is typed). It is a browser notice that layout settled in two steps, not a script failure.",
  },
]

// The areas, in the order they run. Each file exports run().
const AREAS = [
  ["auth", auth],
  ["posts", posts],
  ["social", social],
  ["messages", messages],
  ["calls", calls],
  ["settings", settings],
  ["visibility", visibility],
  ["account", account],
]

// Errors nobody caught. They are printed when they happen and counted as one failed check at the end.
const stray = []
process.on("unhandledRejection", (reason) => {
  const text = reason && reason.stack ? reason.stack : String(reason)
  stray.push(text)
  console.log(`UNHANDLED REJECTION: ${text.split("\n").slice(0, 4).join("\n    ")}`)
})
process.on("uncaughtException", (error) => {
  const text = error && error.stack ? error.stack : String(error)
  stray.push(text)
  console.log(`UNCAUGHT EXCEPTION: ${text.split("\n").slice(0, 4).join("\n    ")}`)
})

async function serverIsUp() {
  try {
    const response = await fetch(`${BASE}/login`, { redirect: "manual", signal: AbortSignal.timeout(90_000) })
    if (response.status >= 500) return `${BASE}/login answered ${response.status}`
    return null
  } catch (error) {
    return `${BASE} did not answer: ${error && error.cause && error.cause.code ? error.cause.code : error.message}`
  }
}

function describeSetup() {
  console.log(`Rhenko end-to-end test`)
  console.log(`  server:        ${BASE}`)
  console.log(`  screenshots:   ${OUT}`)
  console.log(`  browser:       ${CHROMIUM_PATH || "the one Playwright installed"}`)
  console.log(`  wait limit:    ${TIMEOUT} ms per wait`)
  console.log(`  mail log:      ${MAIL_LOG || "not set (the email checks will fail and say so)"}`)
  console.log(`  database dir:  ${DATA_DIR} (used for the scheduled post only)`)
  console.log(`  areas:         ${ONLY.length > 0 ? ONLY.join(", ") : AREAS.map(([name]) => name).join(", ")}`)
}

async function main() {
  const known = AREAS.map(([name]) => name)
  const unknown = ONLY.filter((name) => !known.includes(name))
  if (unknown.length > 0) {
    console.log(`ONLY names areas that do not exist: ${unknown.join(", ")}. The areas are: ${known.join(", ")}.`)
    return 2
  }

  describeSetup()
  const problem = await serverIsUp()
  if (problem) {
    console.log(`\nCannot start: ${problem}. Start the server first, or set BASE_URL.`)
    return 2
  }

  configureNoise(IGNORED_NOISE)
  try {
    await launchBrowser()
  } catch (error) {
    console.log(`\nCannot start: the browser did not launch (${String(error && error.message).split("\n")[0]}). Set CHROMIUM_PATH to a Chromium, or install one for Playwright.`)
    return 2
  }

  const started = performance.now()
  try {
    for (const [name, module] of AREAS) {
      if (ONLY.length > 0 && !ONLY.includes(name)) continue
      await guard(`the ${name} area`, () => module.run())
    }
    area("suite")
    await check("the suite itself ran without an unhandled error", async () => {
      if (stray.length > 0) fail(`${stray.length} error${stray.length === 1 ? "" : "s"} nobody caught:\n${stray.map((text) => text.split("\n").slice(0, 3).join("\n")).join("\n")}`)
    })
  } finally {
    await closeAllVisitors()
    await closeBrowser()
  }

  const { total, failed } = summary()
  console.log(`${((performance.now() - started) / 1000 / 60).toFixed(1)} minutes`)
  const tally = noiseTally()
  console.log("\nMessages ignored (see IGNORED_NOISE at the top of e2e/run.mjs):")
  for (const rule of IGNORED_NOISE) {
    const used = tally.find((entry) => entry.id === rule.id)
    console.log(`  ${rule.id}: ${used ? used.count : 0} time${used && used.count === 1 ? "" : "s"}`)
  }
  if (total === 0) {
    console.log("\nNo check ran.")
    return 2
  }
  return failed > 0 ? 1 : 0
}

process.on("SIGINT", async () => {
  console.log("\nStopped.")
  await closeAllVisitors().catch(() => {})
  await closeBrowser().catch(() => {})
  process.exit(130)
})

main()
  .then((code) => process.exit(code))
  .catch(async (error) => {
    console.log(`\nThe suite stopped: ${error && error.stack ? error.stack : error}`)
    await closeAllVisitors().catch(() => {})
    await closeBrowser().catch(() => {})
    process.exit(2)
  })
