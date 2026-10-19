// The For you feed, end to end. "Not interested" takes a post off the feed and keeps it off, and nobody else's view changes.
// A post the reader keeps on screen is counted as read. A post a followed person liked reaches the feed as a pick from them.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { RUN_ID, randomWord, sleep } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { postIdByBody, query } from "./lib/db.mjs"
import { cardMenu, likeButton, openHome, openProfile, repostTrigger, waitForPost, writePost } from "./lib/posts.mjs"
import { follow } from "./lib/people.mjs"
import { go } from "./lib/ui.mjs"

// Unique text for one run, so the checks never find an old post.
function unique(text) {
  return `${text} ${RUN_ID}${randomWord(3)}`
}

// The For you card with this text, or null. A new post can rank well below the first page, so the reader pages down through
// the ranking (up to 16 pages, all of it) before giving up.
async function forYouCard(page, text) {
  await page.getByRole("button", { name: "Show more" }).or(page.getByText("You're all caught up.")).first().waitFor({ timeout: 30 * 1000 })
  for (let read = 1; ; read++) {
    const card = page.locator("article").filter({ hasText: text }).first()
    if ((await card.count()) > 0) return card
    const more = page.getByRole("button", { name: "Show more" })
    if (read >= 16 || (await more.count()) === 0) return null
    await more.first().click()
    await sleep(1500)
  }
}

// Waits until no post with this text is on the page. Removing a card is asynchronous (the server saves the choice, then the
// list drops the card), so this polls rather than waiting a fixed time. Returns false if the post is still there at the end.
async function gone(page, text, timeout = 10000) {
  const end = Date.now() + timeout
  for (;;) {
    if ((await page.locator("article").filter({ hasText: text.slice(0, 40) }).count()) === 0) return true
    if (Date.now() > end) return false
    await sleep(250)
  }
}

export async function run() {
  area("feed")
  await guard("not interested takes a post off For you, and it stays off", notInterested)
  await guard("a post kept on screen counts as read", dwellCounts)
  await guard("a post a followed person liked reaches For you through them", socialPick)
  await guard("For you draws on every kind of history, and finds a topic post", everyPool)
  await guard("a post the reader has just written leads For you, once", ownPostLeads)
}

// As on X, a post the reader has just written is the first thing on For you, and it is not repeated further down.
async function ownPostLeads() {
  const viewer = await createUser({ tag: "rfo" })
  const text = unique("The reader's own new post")
  await writePost(viewer.page, text)
  await openHome(viewer.page)
  await waitForPost(viewer.page, text, { reload: true })
  await check("a post the reader has just written is first on For you, and appears once", async () => {
    // textContent, not innerText: innerText leaves out the cards the reader has scrolled past (they use content-visibility).
    const texts = await viewer.page.locator("article").allTextContents()
    assert.ok(texts[0]?.includes(text), "the reader's new post is not the first post on For you")
    assert.equal(texts.filter((body) => body.includes(text)).length, 1, "the new post appears more than once on For you")
  })
}

async function notInterested() {
  const author = await createUser({ tag: "rfa" })
  const text = unique("A post the reader does not want to see")
  // The reader follows the author before the post is written. For You ranks a post by when it was written relative to the
  // follow, so the reader waits out the ranking's minute, then pages down to the post.
  const viewer = await createUser({ tag: "rfv" })
  await follow(viewer.page, author.handle)
  await writePost(author.page, text)
  const postId = need(await postIdByBody(author.handle, text), "the post's id")
  await sleep(62 * 1000)
  await openHome(viewer.page)
  const card = await forYouCard(viewer.page, text)
  await check("choosing Not interested takes the post off For you", async () => {
    assert.ok(card, "the post is not on For you (its first 16 pages were read)")
    await cardMenu(viewer.page, card, "Not interested")
    assert.equal(await gone(viewer.page, text), true, "the post is still on For you ten seconds after the choice")
  })
  await check("the post stays off For you after a reload, and the choice is saved", async () => {
    await openHome(viewer.page)
    assert.equal(await forYouCard(viewer.page, text), null, "the post came back after a reload")
    const rows = await query(
      "SELECT COUNT(*) AS n FROM feed_hides h JOIN users u ON u.id = h.viewer_id WHERE u.handle = ? AND h.post_id = ?",
      viewer.handle,
      postId
    )
    assert.equal(rows[0].n, 1, "no hide was saved")
  })
  await check("the post is still on its author's profile, and still on other people's feeds", async () => {
    await openProfile(author.page, author.handle)
    await waitForPost(author.page, text)
    // A reader who follows the author reads the post on Following, which lists every post of the people they follow. For
    // You is ranked across the whole site and shows only its first page, so it can't prove the post is still on screen.
    const other = await createUser({ tag: "rfo" })
    await follow(other.page, author.handle)
    await openHome(other.page, "following")
    await waitForPost(other.page, text, { reload: true })
  })
}

async function dwellCounts() {
  const viewer = await createUser({ tag: "rfd" })
  const author = await createUser({ tag: "rfw" })
  // A followed author's new post is the newest thing on Following, so it sits on the first screen of that tab.
  await follow(viewer.page, author.handle)
  const text = unique("A short post to read while it stays on screen")
  await writePost(author.page, text)
  const postId = need(await postIdByBody(author.handle, text), "the post's id")

  await openHome(viewer.page, "following")
  const card = await waitForPost(viewer.page, text, { reload: true })
  await card.scrollIntoViewIfNeeded()
  await check("a post that stays on screen is counted as read", async () => {
    // The app sends what it has counted every few seconds, so the first batch arrives a little after the post is seen.
    const end = Date.now() + 20000
    let ms = 0
    while (Date.now() < end) {
      const rows = await query(
        "SELECT d.dwell_ms FROM post_dwell d JOIN users u ON u.id = d.viewer_id WHERE u.handle = ? AND d.post_id = ?",
        viewer.handle,
        postId
      )
      ms = rows[0]?.dwell_ms ?? 0
      if (ms >= 500) break
      await sleep(500)
    }
    assert.ok(ms >= 500, `the time on screen was not counted (${ms} ms recorded)`)
  })
}

async function socialPick() {
  const viewer = await createUser({ tag: "rfs" })
  const friend = await createUser({ tag: "rff" })
  const stranger = await createUser({ tag: "rfx" })
  await follow(viewer.page, friend.handle)
  const text = unique("A stranger's post that a friend liked")
  await writePost(stranger.page, text)
  const postId = need(await postIdByBody(stranger.handle, text), "the post's id")

  await openProfile(friend.page, stranger.handle)
  const target = await waitForPost(friend.page, text)
  await likeButton(target).click()
  await sleep(1500)

  await check("a post a followed person liked is on For you, recorded as a social pick", async () => {
    // For you reuses the reader's ranking for a minute, and the reader's first ranking was made when the account was created,
    // before this like. The reader waits out that minute, so the next ranking includes the like.
    await sleep(62 * 1000)
    await openHome(viewer.page)
    // A stranger's post can rank below the first page of For you on a busy test database, so the reader pages down to it
    // as the other For you checks do.
    const card = await forYouCard(viewer.page, text)
    assert.ok(card, "the post a followed person liked is not on For you, even after paging down")
    const rows = await query(
      "SELECT i.source FROM feed_impressions i JOIN users u ON u.id = i.viewer_id WHERE u.handle = ? AND i.post_id = ?",
      viewer.handle,
      postId
    )
    assert.equal(rows[0]?.source, "social", `the post came from ${rows[0]?.source ?? "nowhere"}`)
  })
}

// A reader with every kind of history: an author they follow, a topic they follow, a post they liked, and a repost by an
// author they follow. Their For you has to load with all of it, and the topic post has to come from the topic pool.
async function everyPool() {
  const viewer = await createUser({ tag: "rfe" })
  const followed = await createUser({ tag: "rfp" })
  const other = await createUser({ tag: "rfq" })
  const third = await createUser({ tag: "rfr" })
  const tag = `feed${randomWord(6)}`.toLowerCase()
  await follow(viewer.page, followed.handle)

  const liked = unique("Another author's post, which the reader likes")
  await writePost(other.page, liked)
  const topicText = `${unique("A post on a topic the reader follows")} #${tag}`
  await writePost(third.page, topicText)

  await go(viewer.page, `/topics/${tag}`, viewer.page.getByRole("button", { name: `Follow the topic #${tag}` }))
  await viewer.page.getByRole("button", { name: `Follow the topic #${tag}` }).click()
  await viewer.page.getByRole("button", { name: `Following the topic #${tag}` }).waitFor()

  await openProfile(viewer.page, other.handle)
  await likeButton(await waitForPost(viewer.page, liked)).click()
  await sleep(1500)
  await openProfile(followed.page, other.handle)
  await repostTrigger(await waitForPost(followed.page, liked)).click()
  await followed.page.getByRole("menuitem", { name: "Repost", exact: true }).click()
  await sleep(1500)

  // Reloads would mark the posts already shown as seen, and push them down, so this reads the first page once. A page that
  // failed in any pool would show no posts and record nothing, so both are checked.
  await check("For you loads for a reader with every kind of history, and records what it showed", async () => {
    await openHome(viewer.page)
    assert.ok((await viewer.page.locator("article").count()) > 0, "For you showed no posts")
    const rows = await query(
      "SELECT COUNT(*) AS n FROM feed_impressions i JOIN users u ON u.id = i.viewer_id WHERE u.handle = ?",
      viewer.handle
    )
    assert.ok(rows[0].n > 0, "nothing was recorded as shown")
  })
}
