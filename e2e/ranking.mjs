// For you and the automatic checks, end to end. A followed author's post sits above a newer stranger's post. A clearly
// spammy post is held: hidden from others, and its author gets a notice. A post the checks limit stays on its author's
// profile but is kept off other people's For you feeds and sends no notification. An ordinary post is untouched.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { BASE, RUN_ID, randomWord, sleep } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { databaseProblem, postIdByBody, query } from "./lib/db.mjs"
import { noPost, openHome, openProfile, waitForPost, writePost } from "./lib/posts.mjs"
import { follow } from "./lib/people.mjs"
import { bodyText, go } from "./lib/ui.mjs"

// Unique text for one run, so the checks never find an old post.
function unique(text) {
  return `${text} ${RUN_ID}${randomWord(3)}`
}

export async function run() {
  area("ranking")
  await guard("for you puts a followed author above a newer stranger", forYouOrder)
  await guard("automatic checks hold, limit and leave posts alone", automaticChecks)
}

async function forYouOrder() {
  const friend = await createUser({ tag: "rkf" })
  const stranger = await createUser({ tag: "rks" })
  const viewer = await createUser({ tag: "rkv" })
  // The reader follows the friend before either post exists, so neither post has been shown to the reader yet.
  await follow(viewer.page, friend.handle)
  // The reader then leaves the friend's profile. A post on screen for a while counts as read and is ranked down, so the
  // wait below must not leave the friend's profile in view.
  await viewer.page.goto(`${BASE}/settings/shortcuts`, { waitUntil: "load" })
  const friendText = unique("A friend's ranking check")
  const strangerText = unique("A stranger's ranking check, posted later")
  await writePost(friend.page, friendText)
  await sleep(1500)
  await writePost(stranger.page, strangerText)

  await check("for you lists the followed author's post, above a newer stranger's when both are on the feed", async () => {
    // The reader's sign-up opened Home before the follow, and a For you ranking is reused for a minute per reader. Waiting out
    // that minute lets the follow count, the same as a reader who opens For you a while after following.
    await sleep(62 * 1000)
    await openHome(viewer.page)
    // The composer is ready before the feed streams in behind its skeleton. Read the list only once the feed has ended
    // (a "Show more" button or the caught-up line), so the first read never sees an empty or partial feed.
    await viewer.page
      .getByRole("button", { name: "Show more" })
      .or(viewer.page.getByText("You're all caught up."))
      .first()
      .waitFor({ timeout: 30 * 1000 })
    // A brand-new stranger's post has no likes yet, so it ranks by score until its place comes up: from the eleventh place on,
    // every tenth place is reserved for the best new voice. The feed is read page by page, up to eight pages, until it is in. The text is
    // read as textContent: innerText leaves out the cards the reader has scrolled past (they use content-visibility).
    let texts = []
    let pages = 1
    for (;; pages++) {
      texts = await viewer.page.locator("article").allTextContents()
      if (texts.some((text) => text.includes(strangerText)) || pages >= 8) break
      const more = viewer.page.getByRole("button", { name: "Show more" })
      if ((await more.count()) === 0) break
      await more.first().click()
      await sleep(1500)
    }
    const friendAt = texts.findIndex((text) => text.includes(friendText))
    const strangerAt = texts.findIndex((text) => text.includes(strangerText))
    // The message says what was seen, so a failure shows which post is missing and how far the feed was read.
    const seen = `${texts.length} posts over ${pages} page(s); the friend's post ${friendAt >= 0 ? `is at ${friendAt + 1}` : "is missing"}, the stranger's ${strangerAt >= 0 ? `is at ${strangerAt + 1}` : "is missing"}`
    assert.ok(friendAt >= 0, `the followed author's post is on the For you feed (${seen})`)
    if (strangerAt >= 0) {
      assert.ok(friendAt < strangerAt, `the friend's post (position ${friendAt + 1}) is above the stranger's (position ${strangerAt + 1})`)
    }
  })
}

async function automaticChecks() {
  const problem = databaseProblem()
  assert.equal(problem, null, problem ?? "")
  const author = await createUser({ tag: "rka" })
  const reader = await createUser({ tag: "rkr" })
  await follow(reader.page, author.handle)

  // Each text is one the checks score as described: the held one well past the hold line, the limited one between the
  // limit and hold lines (with the new-account signal added on top), and the ordinary one below the limit.
  const ordinary = unique(`A quiet note about the morning walk, @${reader.handle}`)
  const held = unique("DM me for guaranteed returns! Click the link bit.ly/x1 and claim your reward now, limited slots")
  const limited = unique(`@${reader.handle} Buy cheap followers and likes here, instant delivery. Cheap prices, 100% safe!`)
  await writePost(author.page, ordinary)
  await writePost(author.page, held)
  await writePost(author.page, limited)

  const ordinaryId = need(await postIdByBody(author.handle, ordinary), "the ordinary post's id")
  const heldId = need(await postIdByBody(author.handle, held), "the held post's id")
  const limitedId = need(await postIdByBody(author.handle, limited), "the limited post's id")

  await check("the checks record hold, limit and allow for the three posts", async () => {
    const [heldRow] = await query("SELECT action, score FROM post_risk WHERE post_id = ?", heldId)
    const [limitedRow] = await query("SELECT action, score FROM post_risk WHERE post_id = ?", limitedId)
    const [ordinaryRow] = await query("SELECT action, score FROM post_risk WHERE post_id = ?", ordinaryId)
    assert.equal(heldRow?.action, "hold", `held post: ${JSON.stringify(heldRow)}`)
    assert.equal(limitedRow?.action, "limit", `limited post: ${JSON.stringify(limitedRow)}`)
    assert.equal(ordinaryRow?.action, "allow", `ordinary post: ${JSON.stringify(ordinaryRow)}`)
  })

  await check("a held post is hidden, and its author gets a notice that says why", async () => {
    const [row] = await query("SELECT removed_at FROM posts WHERE id = ?", heldId)
    assert.ok(row && row.removed_at !== null, "the held post is hidden")
    await go(author.page, "/notices", author.page.getByRole("heading", { name: "About your posts" }))
    const text = await bodyText(author.page)
    assert.ok(text.includes("Our automatic checks held this post"), "the notice names the automatic checks")
    assert.ok(text.includes("promises guaranteed returns"), "the notice gives the reason")
    await openProfile(reader.page, author.handle)
    assert.equal(await noPost(reader.page, held.slice(0, 40), 2500), true, "the reader cannot see the held post")
  })

  await check("a limited post stays on its author's profile, but not on other people's For you", async () => {
    await openProfile(author.page, author.handle)
    await waitForPost(author.page, limited)
    await openHome(reader.page)
    assert.equal(await noPost(reader.page, limited.slice(0, 40), 2500), true, "the limited post is not on the reader's For you")
  })

  await check("a limited post sends no notification, and an ordinary one does", async () => {
    const limitedNotices = await query("SELECT COUNT(*) AS n FROM notifications WHERE post_id = ?", limitedId)
    const ordinaryNotices = await query("SELECT COUNT(*) AS n FROM notifications WHERE post_id = ?", ordinaryId)
    assert.equal(limitedNotices[0].n, 0, "a limited post notified someone")
    assert.ok(ordinaryNotices[0].n >= 1, "an ordinary post's mention did not notify the mentioned person")
  })

  await check("an ordinary post is shown to the reader as usual", async () => {
    await openProfile(reader.page, author.handle)
    await waitForPost(reader.page, ordinary, { reload: true })
  })
}
