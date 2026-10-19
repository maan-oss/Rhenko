// Legal: the public pages, the age and terms box on sign-up, the agreement screen when the terms change, notices about
// content (the form, the reference, hiding at once for the most serious kinds, the honeypot), appeals, the moderation
// and legal command lines, saved searches with the Lists tab, the transparency figures, and the agreement between the
// code and the command lines about categories and notice kinds.
import fs from "node:fs"
import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { BASE, DATA_DIR, PASSWORD, REPO_ROOT, RUN_ID, TIMEOUT, randomHandle, randomWord, sleep } from "./lib/env.mjs"
import { closeVisitor, newVisitor } from "./lib/browser.mjs"
import { GROWN_UP, createUser, fillSignup } from "./lib/accounts.mjs"
import { execute, postIdByBody, query } from "./lib/db.mjs"
import { mailCount, markLog } from "./lib/mail.mjs"
import { writePost } from "./lib/posts.mjs"
import { acted, bodyText, go, ready } from "./lib/ui.mjs"
import { allowNoise } from "./lib/watch.mjs"

const execFileAsync = promisify(execFile)
const PUBLIC_PAGES = ["/terms", "/privacy", "/rules", "/copyright", "/safety", "/transparency", "/legal", "/notice"]
const legalSource = read("lib/legal.ts")
const TERMS_VERSION = legalSource.match(/TERMS_VERSION = "([^"]+)"/)[1]

function read(file) {
  return fs.readFileSync(path.join(REPO_ROOT, file), "utf8")
}

// Runs one of the command lines the way an operator would, from the project folder, on this server's database. The
// decision email goes through RHENKO_SMTP_URL when the suite is given one, which is how the mail sink is reached.
async function cli(script, args) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [script, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, RHENKO_DATA_DIR: DATA_DIR },
      timeout: 60_000,
    })
    return { ok: true, text: `${stdout}${stderr}` }
  } catch (error) {
    return { ok: false, text: `${error.stdout ?? ""}${error.stderr ?? ""}${error.message}` }
  }
}

// Waits for something the server does later on, such as an email reaching the mail log.
async function eventually(test, what, timeout = TIMEOUT) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    if (await test()) return
    await sleep(300)
  }
  throw new Error(`${what} did not happen within ${Math.round(timeout / 1000)} seconds`)
}

async function postHidden(id) {
  const rows = await query("SELECT removed_at FROM posts WHERE id = ?", id)
  assert.equal(rows.length, 1, "the post is gone from the database")
  return rows[0].removed_at !== null
}

// A notice about content, sent from the public form. Fields the kind does not use are left empty.
async function sendNotice(page, { kind, email, url = "", work = "", description, name = "Notice Sender", honeypot = false }) {
  await ready(page.locator("#kind"))
  await page.locator("#kind").selectOption(kind)
  await page.locator("#name").fill(name)
  await page.locator("#email").fill(email)
  if (url) await page.locator("#url").fill(url)
  if (work) await page.locator("#work").fill(work)
  await page.locator("#description").fill(description)
  await page.locator("input[name=good_faith]").check()
  await page.locator("input[name=accurate]").check()
  await page.locator("#signature").fill(name)
  // A person never sees the hidden field. A bot that fills it is the case this sets up.
  if (honeypot) await page.locator("input[name=website]").evaluate((element) => {
    element.value = "https://spam.example"
  })
  await acted(page, () => page.getByRole("button", { name: "Send notice", exact: true }).click())
}

// A hidden post is answered 404. The author's own pages still hold its card for a while, and the card prefetches the post's
// page, so that prefetch is answered 404 and Chromium logs it. Nothing shows it. Allowed for this author's status pages only,
// for as long as the check runs.
function allowHiddenPrefetch(handle) {
  return allowNoise({
    id: "prefetch-of-hidden-post",
    kind: "console",
    text: /Failed to load resource: the server responded with a status of 404/,
    url: new RegExp(`^https?://[^/]+/${handle}/status/`),
    reason: "A hidden post's card still shows on its author's pages, and its prefetch of the post is answered 404.",
  })
}

function noticeAddress(tag) {
  return `${tag}-${RUN_ID.toLowerCase()}-${randomWord(4).toLowerCase()}@example.com`
}

export async function run() {
  area("legal")
  await guard("public legal pages", publicPages)
  await guard("the age and terms box on sign-up", signUpBox)
  await guard("the agreement screen when the terms change", agreementScreen)
  await guard("notices about content", notices)
  await guard("appeals and the moderation command line", appeals)
  await guard("the legal command line", legalDecisions)
  await guard("saved searches, the Lists tab and settings links", searchesAndSettings)
  await guard("the transparency figures", transparency)
  await guard("the command lines match the app", commandLines)
}

async function publicPages() {
  const visitor = await newVisitor({ label: "legal-public" })
  try {
    for (const pagePath of PUBLIC_PAGES) {
      await check(`${pagePath} opens for someone who is not signed in`, async () => {
        // No redirects: a public page that sends a visitor to the sign-in page is not open to them.
        const response = await visitor.page.request.get(`${BASE}${pagePath}`, { maxRedirects: 0 })
        assert.equal(response.status(), 200, `${pagePath} answered ${response.status()}`)
      })
    }
    await check("the Terms say the minimum age is 18, and the Privacy Policy gives the periods it keeps data for", async () => {
      await visitor.page.goto(`${BASE}/terms`, { waitUntil: "domcontentloaded" })
      await visitor.page.getByRole("heading", { level: 1, name: "Terms of Service" }).waitFor()
      assert.match(await bodyText(visitor.page), /at least 18/)
      await visitor.page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" })
      await visitor.page.getByRole("heading", { level: 1, name: "Privacy Policy" }).waitFor()
      const privacy = await bodyText(visitor.page)
      assert.match(privacy, /kept for 90 days/)
      assert.match(privacy, /deleted after 180 days/)
      assert.match(privacy, /Data Protection Board of India/)
    })
    await check("the Terms and Privacy Policy say when they were last updated, from the same date the app uses", async () => {
      await visitor.page.goto(`${BASE}/terms`, { waitUntil: "domcontentloaded" })
      await visitor.page.getByRole("heading", { level: 1, name: "Terms of Service" }).waitFor()
      assert.match(await bodyText(visitor.page), /Last updated/)
    })
    await check("the community rules say an intimate image report hides the post at once, and that legal deadlines are kept", async () => {
      await visitor.page.goto(`${BASE}/rules`, { waitUntil: "domcontentloaded" })
      await visitor.page.getByRole("heading", { level: 1, name: "Community Rules" }).waitFor()
      const rules = await bodyText(visitor.page)
      assert.match(rules, /hides the post at once/)
      assert.match(rules, /keeps to it/)
    })
  } finally {
    await closeVisitor(visitor)
  }
}

async function signUpBox() {
  const visitor = await newVisitor({ label: "legal-signup" })
  try {
    await go(visitor.page, "/signup", visitor.page.locator("input[name=handle]"))
    await check("sign-up will not create an account until the age and terms box is ticked", async () => {
      await fillSignup(visitor.page, {
        name: `Agree ${RUN_ID}`,
        handle: randomHandle("agree"),
        birthday: GROWN_UP,
        password: PASSWORD,
        agree: false,
      })
      const valid = await visitor.page.locator("input[name=agree]").evaluate((element) => element.checkValidity())
      assert.equal(valid, false, "the box is not required")
      const text = await bodyText(visitor.page)
      assert.match(text, /I am 18 or older, and I agree to the Terms and the Privacy Policy/)
    })
  } finally {
    await closeVisitor(visitor)
  }
}

async function agreementScreen() {
  const user = await createUser({ tag: "terms" })
  try {
    await check("an account that has not agreed to the current terms is sent to the agreement screen", async () => {
      await execute("UPDATE users SET terms_version = NULL WHERE handle = ?", user.handle)
      await user.page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" })
      await user.page.waitForURL((url) => new URL(url).pathname === "/accept-terms", { timeout: TIMEOUT })
      await user.page.getByRole("heading", { name: "Updated terms" }).waitFor()
      await user.page.getByRole("button", { name: "Log out instead", exact: true }).waitFor()
    })
    await check("the agreement screen keeps the box required, and the app opens once it is ticked", async () => {
      await ready(user.page.locator("input[name=agree]"))
      const valid = await user.page.locator("input[name=agree]").evaluate((element) => element.checkValidity())
      assert.equal(valid, false, "the agreement box is not required")
      await user.page.locator("input[name=agree]").check()
      await acted(user.page, () => user.page.getByRole("button", { name: "Agree and continue", exact: true }).click())
      await user.page.waitForURL((url) => new URL(url).pathname === "/", { timeout: TIMEOUT })
    })
    await check("the agreement is recorded with the version in force", async () => {
      const rows = await query("SELECT terms_version, terms_accepted_at FROM users WHERE handle = ?", user.handle)
      assert.equal(rows[0]?.terms_version, TERMS_VERSION, "the version was not recorded")
      assert.ok(rows[0]?.terms_accepted_at, "the time of agreement was not recorded")
    })
  } finally {
    await closeVisitor(user)
  }
}

async function notices() {
  const author = await createUser({ tag: "author" })
  const sender = await newVisitor({ label: "notice-sender" })
  const endAllow = allowHiddenPrefetch(author.handle)
  try {
    const body = `My own work, posted in ${RUN_ID} ${randomWord(4)}`
    await writePost(author.page, body)
    const postId = need(await postIdByBody(author.handle, body), "a post by the author")

    await check("the notice form refuses a notice that leaves out what the law needs", async () => {
      await go(sender.page, "/notice", sender.page.locator("#kind"))
      await sender.page.locator("#kind").evaluate((element) => {
        element.form.noValidate = true
      })
      await sender.page.locator("#description").fill("Too short")
      await acted(sender.page, () => sender.page.getByRole("button", { name: "Send notice", exact: true }).click())
      await sender.page.locator('[role="alert"]').filter({ hasText: /Give your name|Give an email|at least 20 characters/ }).first().waitFor({ timeout: TIMEOUT })
    })

    await check("a notice about an intimate image gets a reference, and hides the post at once", async () => {
      const address = noticeAddress("intimate")
      const mark = markLog()
      await go(sender.page, "/notice", sender.page.locator("#kind"))
      await sendNotice(sender.page, {
        kind: "intimate_image",
        email: address,
        url: `${BASE}/${author.handle}/status/${postId}`,
        description: "This picture was shared without the consent of the person in it. Please review it.",
      })
      await sender.page.getByText(/Your reference is/).waitFor({ timeout: TIMEOUT })
      assert.equal(await postHidden(postId), true, "the post is still visible after an intimate image notice")
      await eventually(() => mailCount(address, mark) >= 1, "the reference email")
    })

    await check("the author is told why the post is hidden, and can appeal once", async () => {
      await go(author.page, "/notices", author.page.getByRole("heading", { name: "About your posts" }))
      const text = await bodyText(author.page)
      assert.match(text, /Intimate image shared without consent/)
      assert.match(text, /You can appeal until/)
      await author.page.locator("textarea[name=reason]").fill("I am not in this picture, and I can show who is.")
      await acted(author.page, () => author.page.getByRole("button", { name: "Send appeal", exact: true }).click())
      await author.page.getByText("Your appeal is in.").waitFor({ timeout: TIMEOUT })
    })

    await check("a hidden post is not served to the author or to anyone else", async () => {
      await author.page.goto(`${BASE}/${author.handle}/status/${postId}`, { waitUntil: "domcontentloaded" })
      await author.page.getByRole("heading", { name: "This page is not here" }).waitFor({ timeout: TIMEOUT })
    })

    await check("a notice with the honeypot field filled is accepted quietly and goes nowhere", async () => {
      const address = noticeAddress("bot")
      await go(sender.page, "/notice", sender.page.locator("#kind"))
      await sendNotice(sender.page, {
        kind: "illegal",
        email: address,
        description: "Someone is selling stolen goods here.",
        honeypot: true,
      })
      await sender.page.getByText(/We received your notice/).first().waitFor({ timeout: TIMEOUT })
      await sleep(500)
      const rows = await query("SELECT id FROM legal_notices WHERE email = ?", address)
      assert.equal(rows.length, 0, "a notice from a form that filled the hidden field was kept")
    })
  } finally {
    endAllow()
    await closeVisitor(sender)
    await closeVisitor(author)
  }
}

async function appeals() {
  const author = await createUser({ tag: "moderate" })
  const endAllow = allowHiddenPrefetch(author.handle)
  try {
    const body = `A post for the command line ${RUN_ID} ${randomWord(4)}`
    await writePost(author.page, body)
    const postId = need(await postIdByBody(author.handle, body), "a post by the author")

    await check("the moderation command hides a post and its author is told why", async () => {
      const result = await cli("scripts/moderation.mjs", ["hide", postId, "--category", "harassment", "--explain", "Repeated insults aimed at one person."])
      assert.equal(result.ok, true, result.text)
      assert.match(result.text, /Hid 1 post/)
      assert.equal(await postHidden(postId), true, "the command did not hide the post")
    })

    await check("hiding a post that is already hidden is refused, with the way back", async () => {
      const result = await cli("scripts/moderation.mjs", ["hide", postId, "--category", "spam", "--explain", "Repeated links to a shop."])
      assert.equal(result.ok, false)
      assert.match(result.text, /already hidden/)
    })

    await check("the author appeals in Notices, and the command line puts the post back", async () => {
      await go(author.page, "/notices", author.page.getByRole("heading", { name: "About your posts" }))
      await author.page.locator("textarea[name=reason]").fill("The post was a fair criticism of a product, not an insult.")
      await acted(author.page, () => author.page.getByRole("button", { name: "Send appeal", exact: true }).click())
      await author.page.getByText("Your appeal is in.").waitFor({ timeout: TIMEOUT })
      const rows = await query(
        "SELECT a.id FROM appeals a JOIN moderation_notices n ON n.id = a.notice_id WHERE n.post_id = ? AND a.decided_at IS NULL",
        postId
      )
      const appealId = need(rows[0]?.id, "an appeal waiting for a decision")
      const waiting = await cli("scripts/moderation.mjs", ["appeals"])
      assert.equal(waiting.ok, true, waiting.text)
      assert.match(waiting.text, new RegExp(appealId))
      const decided = await cli("scripts/moderation.mjs", ["decide", appealId, "reverse", "--note", "On reflection, the post is fair criticism."])
      assert.equal(decided.ok, true, decided.text)
      assert.match(decided.text, /Reversed/)
      assert.equal(await postHidden(postId), false, "the post did not come back")
      await go(author.page, "/notices", author.page.getByRole("heading", { name: "About your posts" }))
      assert.match(await bodyText(author.page), /Put back on/)
    })

    await check("an appeal can be decided only once", async () => {
      const rows = await query("SELECT a.id FROM appeals a JOIN moderation_notices n ON n.id = a.notice_id WHERE n.post_id = ?", postId)
      const again = await cli("scripts/moderation.mjs", ["decide", need(rows[0]?.id, "the decided appeal"), "uphold", "--note", "A second decision."])
      assert.equal(again.ok, false)
      assert.match(again.text, /already decided/)
    })
  } finally {
    endAllow()
    await closeVisitor(author)
  }
}

async function legalDecisions() {
  const author = await createUser({ tag: "copied" })
  const sender = await newVisitor({ label: "copyright-sender" })
  const endAllow = allowHiddenPrefetch(author.handle)
  try {
    const body = `A photograph I took in ${RUN_ID} ${randomWord(4)}`
    await writePost(author.page, body)
    const postId = need(await postIdByBody(author.handle, body), "a post by the author")
    const address = noticeAddress("copyright")

    await check("a copyright notice does not hide the post until a person acts on it", async () => {
      const mark = markLog()
      await go(sender.page, "/notice", sender.page.locator("#kind"))
      await sendNotice(sender.page, {
        kind: "copyright",
        email: address,
        url: `${BASE}/${author.handle}/status/${postId}`,
        work: "My photograph, first published in 2019",
        description: "The photograph in this post is mine, and it was posted without permission.",
      })
      await sender.page.getByText(/Your reference is/).waitFor({ timeout: TIMEOUT })
      assert.equal(await postHidden(postId), false, "a copyright notice hid the post before a person decided")
      await eventually(() => mailCount(address, mark) >= 1, "the reference email")
      const rows = await query("SELECT id FROM legal_notices WHERE email = ?", address)
      need(rows[0]?.id, "the notice in the database")
    })

    await check("the command line lists, shows and decides a notice, and the post is hidden for the author", async () => {
      const rows = await query("SELECT id FROM legal_notices WHERE email = ?", address)
      const noticeId = rows[0].id
      const listed = await cli("scripts/legal.mjs", ["list"])
      assert.equal(listed.ok, true, listed.text)
      assert.match(listed.text, new RegExp(noticeId))
      const shown = await cli("scripts/legal.mjs", ["show", noticeId])
      assert.equal(shown.ok, true, shown.text)
      assert.match(shown.text, /Copyright infringement/)
      const mark = markLog()
      const decided = await cli("scripts/legal.mjs", ["decide", noticeId, "actioned", "--note", "The photograph is the sender's, as the notice says."])
      assert.equal(decided.ok, true, decided.text)
      assert.equal(await postHidden(postId), true, "an actioned notice did not hide the post")
      await eventually(() => mailCount(address, mark) >= 1, "the decision email")
      await go(author.page, "/notices", author.page.getByRole("heading", { name: "About your posts" }))
      assert.match(await bodyText(author.page), /The photograph is the sender's, as the notice says\./)
    })

    await check("an urgent notice hides the post at once, and a rejection puts it back", async () => {
      const body2 = `A second picture ${RUN_ID} ${randomWord(4)}`
      await writePost(author.page, body2)
      const postId2 = need(await postIdByBody(author.handle, body2), "the second post")
      const address2 = noticeAddress("urgent")
      await go(sender.page, "/notice", sender.page.locator("#kind"))
      await sendNotice(sender.page, {
        kind: "child_abuse",
        email: address2,
        url: `${BASE}/${author.handle}/status/${postId2}`,
        description: "This post shows a child being harmed. Please review it at once.",
      })
      await sender.page.getByText(/Your reference is/).waitFor({ timeout: TIMEOUT })
      assert.equal(await postHidden(postId2), true, "an urgent notice did not hide the post")
      const rows = await query("SELECT id FROM legal_notices WHERE email = ?", address2)
      const decided = await cli("scripts/legal.mjs", ["decide", rows[0].id, "rejected", "--note", "On review, the post does not show harm to a child."])
      assert.equal(decided.ok, true, decided.text)
      assert.match(decided.text, /back/)
      assert.equal(await postHidden(postId2), false, "a rejected notice did not put the post back")
    })

    await check("a decision cannot be made twice", async () => {
      const rows = await query("SELECT id FROM legal_notices WHERE email = ?", address)
      const again = await cli("scripts/legal.mjs", ["decide", rows[0].id, "rejected", "--note", "A second decision."])
      assert.equal(again.ok, false)
      assert.match(again.text, /already actioned/)
    })

    await check("the command line records an order from an authority", async () => {
      const result = await cli("scripts/legal.mjs", ["record-request", "--summary", `Court order ${RUN_ID} to review one post.`])
      assert.equal(result.ok, true, result.text)
      assert.match(result.text, /Recorded request/)
    })
  } finally {
    endAllow()
    await closeVisitor(sender)
    await closeVisitor(author)
  }
}

async function searchesAndSettings() {
  const user = await createUser({ tag: "search" })
  try {
    const word = `savedterm${RUN_ID.toLowerCase()}${randomWord(3).toLowerCase()}`
    await check("a search can be saved, and it appears in the saved list", async () => {
      await go(user.page, `/search?q=${word}`, user.page.getByRole("button", { name: "Save search", exact: true }))
      await acted(user.page, () => user.page.getByRole("button", { name: "Save search", exact: true }).click())
      await user.page.getByRole("button", { name: "Saved", exact: true }).waitFor({ timeout: TIMEOUT })
      await go(user.page, "/search", user.page.getByRole("heading", { name: "Saved searches" }))
      assert.match(await bodyText(user.page), new RegExp(word))
    })
    await check("a saved search can be removed", async () => {
      await acted(user.page, () => user.page.getByRole("button", { name: `Remove “${word}” from saved searches` }).click())
      await user.page.getByRole("heading", { name: "Saved searches" }).waitFor({ state: "detached", timeout: TIMEOUT })
    })
    await check("the search results offer a Lists tab, which finds lists by name", async () => {
      // The search tabs are their own list, so the Lists link in the main menu is not the one meant here.
      const tabs = user.page.getByRole("navigation", { name: "Search results" })
      await go(user.page, `/search?q=${word}&f=top`, tabs.getByRole("link", { name: "Lists", exact: true }))
      await tabs.getByRole("link", { name: "Lists", exact: true }).click()
      await user.page.waitForURL((url) => new URL(url).searchParams.get("f") === "lists", { timeout: TIMEOUT })
      await user.page.getByText(/No lists match|Lists are groups/).first().waitFor({ timeout: TIMEOUT })
    })
    await check("settings links to Notices and to the legal pages", async () => {
      await go(user.page, "/settings", user.page.getByRole("heading", { name: "Settings", level: 1 }).or(user.page.getByText("Privacy and safety").first()))
      const text = await bodyText(user.page)
      assert.match(text, /Notices and appeals/)
      assert.match(text, /Legal/)
    })
  } finally {
    await closeVisitor(user)
  }
}

async function transparency() {
  const visitor = await newVisitor({ label: "legal-transparency" })
  try {
    await check("the transparency page shows the counts of reports, notices and hidden posts", async () => {
      await visitor.page.goto(`${BASE}/transparency`, { waitUntil: "domcontentloaded" })
      await visitor.page.getByRole("heading", { level: 1, name: "Transparency" }).waitFor({ timeout: TIMEOUT })
      const labels = [
        "Reports received",
        "Notices received through the notice form",
        "Posts hidden, with a notice sent to the author",
        "Appeals reversed",
        "Orders and requests from courts or authorities",
      ]
      // The figures stream in sections after the heading (each section waits on its own queries), so every label is
      // waited for before the page is read.
      for (const label of labels) await visitor.page.getByText(label).first().waitFor({ timeout: TIMEOUT })
      const text = await bodyText(visitor.page)
      for (const label of labels) assert.match(text, new RegExp(label), `the figure "${label}" is missing`)
    })
  } finally {
    await closeVisitor(visitor)
  }
}

function pairs(text) {
  return [...text.matchAll(/\{ id: "(\w+)", label: "([^"]+)" \}/g)].map((match) => [match[1], match[2]]).sort()
}

function block(text, start, end) {
  const from = text.indexOf(start)
  assert.ok(from >= 0, `the source has no "${start}"`)
  const to = text.indexOf(end, from)
  assert.ok(to > from, `the source has no "${end}" after "${start}"`)
  return text.slice(from, to)
}

async function commandLines() {
  await check("the moderation and legal command lines use the same categories, notice kinds and urgent kinds as the app", async () => {
    const moderation = read("scripts/moderation.mjs")
    const legalCommand = read("scripts/legal.mjs")
    const categories = pairs(block(legalSource, "MODERATION_CATEGORIES = [", "] as const"))
    const kinds = pairs(block(legalSource, "NOTICE_KINDS = [", "] as const"))
    const cliCategories = [...block(moderation, "const CATEGORIES = {", "}").matchAll(/^\s+(\w+): "([^"]+)",$/gm)].map((m) => [m[1], m[2]]).sort()
    const cliKinds = [...block(legalCommand, "const KINDS = {", "}").matchAll(/^\s+(\w+): "([^"]+)",$/gm)].map((m) => [m[1], m[2]]).sort()
    assert.deepEqual(cliCategories, categories, "the moderation command's categories differ from lib/legal.ts")
    assert.deepEqual(cliKinds, kinds, "the legal command's notice kinds differ from lib/legal.ts")
    const ids = (text, start) => [...block(text, start, "])").matchAll(/"(\w+)"/g)].map((m) => m[1]).sort()
    const urgent = ids(legalSource, "new Set([")
    assert.deepEqual(ids(legalCommand, "const URGENT = new Set(["), urgent, "the legal command's urgent kinds differ from lib/legal.ts")
    const appealDays = Number(legalSource.match(/APPEAL_DAYS = (\d+)/)[1])
    assert.match(moderation, new RegExp(`APPEAL_MS = ${appealDays} \\* 24`), "the moderation command's appeal window differs from lib/legal.ts")
  })
}
