// Who may see what. A protected account's posts, a blocked person's posts, drafts and scheduled posts, and the Likes tab.
// Every "cannot" is checked in every way a post can be reached: its own page by link, a quote of it, the pinned spot on
// a profile, a reply under another post, search, the feed API that profiles load more posts from, and the picture file.
// And every "cannot" is paired with a "can": the same links are opened first by someone who may see the post, so a typo
// in a link or a page that is simply broken cannot pass as "hidden".
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { BASE, RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { makePng } from "./lib/files.mjs"
import { block, follow, followButton, openNotifications, requestsBox, setProtected, withdrawButton } from "./lib/people.mjs"
import {
  COMPOSER_TEXT,
  addAlt,
  attach,
  card,
  cardCount,
  cardMenu,
  cardPostId,
  homeComposer,
  likeButton,
  noPost,
  openDrafts,
  openHome,
  openProfile,
  openSearch,
  repostTrigger,
  showTools,
  typeIn,
  waitForPost,
  writePost,
} from "./lib/posts.mjs"
import { acted, bodyText, go, missingId, notHere, toastText } from "./lib/ui.mjs"

const QUOTE_GONE = "This post isn't available."
const PROFILE_TABS = ["posts", "highlights", "replies", "media", "reposts"]

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

// The last word of a text. It is unique to this run, so searching for it finds this post and nothing else.
function tokenOf(text) {
  return text.split(" ").pop()
}

export async function run() {
  area("visibility")
  for (const phone of [false, true]) {
    const where = phone ? "a phone" : "a computer"
    await guard(`protected account on ${where}`, () => protectedFlow({ phone }))
    await guard(`blocked account on ${where}`, () => blockedFlow({ phone }))
    await guard(`drafts and scheduled posts on ${where}`, () => draftsFlow({ phone }))
    await guard(`likes on ${where}`, () => likesFlow({ phone }))
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Ways to reach a post
// ---------------------------------------------------------------------------------------------------------------------

// The post's own page opens: the server answers 200 and the post is on it.
async function opensPost(page, handle, id, text) {
  const response = await page.goto(`/${handle}/status/${id}`, { waitUntil: "domcontentloaded" })
  assert.equal(response?.status(), 200, `the page of a post that may be seen answered ${response?.status()} (/${handle}/status/${id})`)
  await waitForPost(page, text)
}

// The post's own page is a real 404 with the "not here" page, and carries nothing of the post.
async function refusesPost(page, handle, id, text, who) {
  const answer = await notHere(page, `/${handle}/status/${id}`)
  const unknown = await notHere(page, `/${handle}/status/${missingId()}`)
  assert.equal(answer, unknown, `${who}: the page of a post they may not see answers differently from a post that does not exist`)
  assert.equal(await cardCount(page, text), 0, `${who}: a post they may not see is shown on its own page`)
  assert.equal((await bodyText(page)).includes(text), false, `${who}: the text of a post they may not see is on its page`)
}

// What the feed API answers for a spec, as text and as parsed data.
async function feedOf(page, spec) {
  const response = await page.request.get(`${BASE}/api/feed?spec=${encodeURIComponent(JSON.stringify(spec))}`)
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // The caller's assertion on the status and the text says what came back.
  }
  return { status: response.status(), text, json }
}

async function feedHolds(page, spec, text) {
  const feed = await feedOf(page, spec)
  assert.equal(feed.status, 200, `the feed ${JSON.stringify(spec)} answered ${feed.status}`)
  assert.ok(feed.text.includes(text), `the feed ${JSON.stringify(spec)} does not carry a post that may be seen`)
}

// The feed says nothing of the post. `locked` means the feed must also say the profile is protected.
async function feedLacks(page, spec, text, who, { locked = false } = {}) {
  const feed = await feedOf(page, spec)
  assert.equal(feed.status, 200, `${who}: the feed ${JSON.stringify(spec)} answered ${feed.status}`)
  assert.ok(feed.json && Array.isArray(feed.json.items), `${who}: the feed ${JSON.stringify(spec)} did not answer with a list`)
  assert.equal(feed.text.includes(text), false, `${who}: the feed ${JSON.stringify(spec)} carries a post they may not see`)
  assert.equal(feed.json.items.length, 0, `${who}: the feed ${JSON.stringify(spec)} lists posts`)
  if (locked) assert.equal(feed.json.locked, true, `${who}: the feed ${JSON.stringify(spec)} does not say that the profile is protected`)
}

// The search page lists the post, and so does the feed API that the search page loads more results from.
async function findsInSearch(page, text) {
  await openSearch(page, tokenOf(text))
  await waitForPost(page, text)
  await feedHolds(page, { kind: "search", q: tokenOf(text), sort: "latest" }, text)
}

async function missesInSearch(page, text, who) {
  await openSearch(page, tokenOf(text))
  await page.getByText(/No results for/).waitFor()
  assert.equal(await cardCount(page, text), 0, `${who}: a post they may not see is in the search results`)
  const feed = await feedOf(page, { kind: "search", q: tokenOf(text), sort: "latest" })
  assert.equal(feed.status, 200, `${who}: the search feed answered ${feed.status}`)
  assert.equal(feed.text.includes(text), false, `${who}: the search feed carries a post they may not see`)
}

async function mediaStatus(page, path) {
  const response = await page.request.get(`${BASE}${path}`)
  return { status: response.status(), type: response.headers()["content-type"] ?? "" }
}

async function mediaOpens(page, path) {
  const file = await mediaStatus(page, path)
  assert.equal(file.status, 200, `the picture file ${path} answered ${file.status} to someone who may see its post`)
  assert.match(file.type, /^image\//)
}

async function mediaRefused(page, path, who) {
  const file = await mediaStatus(page, path)
  assert.equal(file.status, 404, `${who}: the picture file of a post they may not see answered ${file.status} instead of 404`)
}

// The quote card on the quoting person's profile shows the quoted post and links to it.
async function showsQuote(page, { quoter, quoteText, quotedText, quotedId }) {
  await openProfile(page, quoter.handle)
  const row = await waitForPost(page, quoteText)
  await row.getByText(quotedText).first().waitFor()
  await row.locator(`a[href$="/status/${quotedId}"]`).first().waitFor()
}

// The quote card says only that the post is not available: no text, no name, no link. The quote's own page says the same.
async function hidesQuote(page, { quoter, quoteText, quoteId, quotedText, quotedId }, who) {
  await openProfile(page, quoter.handle)
  const row = await waitForPost(page, quoteText)
  await row.getByText(QUOTE_GONE).waitFor()
  assert.equal(await row.getByText(quotedText).count(), 0, `${who}: the text of a post they may not see is in a quote card`)
  assert.equal(await row.locator(`a[href*="${quotedId}"]`).count(), 0, `${who}: a quote card links to a post they may not see`)
  await opensPost(page, quoter.handle, quoteId, quoteText)
  await page.getByText(QUOTE_GONE).first().waitFor()
  assert.equal((await bodyText(page)).includes(quotedText), false, `${who}: the quote's own page carries the text of a post they may not see`)
}

// Quotes someone's post from their profile.
async function quote(page, ownerHandle, targetText, comment) {
  await openProfile(page, ownerHandle)
  const target = await waitForPost(page, targetText)
  await repostTrigger(target).click()
  await page.getByRole("menuitem", { name: "Quote post" }).click()
  const dialog = page.getByRole("dialog", { name: "Quote post" })
  await dialog.waitFor()
  await typeIn(dialog, comment)
  await acted(page, () => dialog.getByRole("button", { name: "Quote", exact: true }).click())
  await toastText(page, /Quote posted/)
}

// Posts a picture from the home page with alt text.
async function writePicture(page, text, alt, file) {
  await openHome(page)
  const form = homeComposer(page)
  await attach(form, file)
  await form.locator('img[alt="Selected image"]').waitFor()
  await typeIn(form, text)
  await addAlt(form, alt)
  await acted(page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(page, /^Posted\./)
}

// A picture seed that is new on every run. Pictures are stored under a name made from their bytes, so a picture that matches
// an earlier public one shares its file, and a protected picture would then be public too. A fixed seed does that.
function freshSeed() {
  return 1 + Math.floor(Math.random() * 1e9)
}

// The path of a picture on the page, found by its alt text.
async function mediaPathOf(page, alt) {
  const src = await page.locator(`img[alt="${alt}"]`).first().getAttribute("src")
  assert.ok(src && src.startsWith("/media/"), `the picture is not served from /media/ (${src})`)
  return src
}

// The id of the post a profile shows with this text.
async function idOnProfile(page, handle, text) {
  await openProfile(page, handle)
  return cardPostId(await waitForPost(page, text))
}

// What a person who may see everything about the protected account's posts sees. `mark` is told after each way in works, so the
// checks that expect a refusal can tell which "can" came first.
async function seesProtectedPosts(page, c, mark = () => {}) {
  await opensPost(page, c.owner.handle, c.ids.post, c.text.post)
  mark("open")
  await showsQuote(page, { quoter: c.quoter, quoteText: c.text.quote, quotedText: c.text.post, quotedId: c.ids.post })
  mark("quote")
  await openProfile(page, c.owner.handle)
  const first = page.locator("article").first()
  await first.getByText("Pinned", { exact: true }).waitFor()
  assert.ok((await first.innerText()).includes(c.text.pinned), "the first post on the profile is not the pinned post")
  mark("pinned")
  await findsInSearch(page, c.text.post)
  mark("search")
  await feedHolds(page, { kind: "profile", tab: "posts", handle: c.owner.handle }, c.text.post)
  mark("feed")
  await mediaOpens(page, c.mediaPath)
  mark("media")
  await opensPost(page, c.quoter.handle, c.ids.thread, c.text.thread)
  await waitForPost(page, c.text.reply)
  mark("reply")
}

const CONTROLS = {
  open: "the post's own page",
  quote: "the quote card",
  pinned: "the pinned post",
  search: "the search result",
  feed: "the feed API",
  media: "the picture file",
  reply: "the reply under another post",
}

function requireControl(seen, step) {
  need(seen.has(step), `a stranger reaching ${CONTROLS[step]} while the account was public (that check did not pass)`)
}

// ---------------------------------------------------------------------------------------------------------------------
// A protected account
// ---------------------------------------------------------------------------------------------------------------------

async function protectedFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const t = phone ? "p" : "d"
  const owner = await createUser({ tag: `pro${t}`, phone })
  const quoter = await createUser({ tag: `pqu${t}`, phone })
  const stranger = await createUser({ tag: `pst${t}`, phone })
  const friend = await createUser({ tag: `pfr${t}`, phone })
  const text = {
    post: uniq("Public post that gets quoted"),
    pinned: uniq("Post that gets pinned"),
    picture: uniq("Picture post"),
    quote: uniq("Quote of the owner"),
    thread: uniq("Thread from another account"),
    reply: uniq("Reply from the owner"),
  }
  const alt = `Swatch ${randomWord(6)}`
  const c = { owner, quoter, text, ids: {}, mediaPath: null }
  const seen = new Set()
  const ownerFeed = (tab) => ({ kind: "profile", tab, handle: owner.handle })

  await check(`${where}: set-up: the owner posts, pins and shares a picture, another account quotes it, and the owner replies under that account's post`, async () => {
    await writePost(owner.page, text.post)
    await writePost(owner.page, text.pinned)
    await writePicture(owner.page, text.picture, alt, makePng(`protected-${where}.png`, { seed: freshSeed() }))
    c.ids.post = await idOnProfile(owner.page, owner.handle, text.post)
    c.ids.pinned = await idOnProfile(owner.page, owner.handle, text.pinned)
    c.mediaPath = await mediaPathOf(owner.page, alt)
    await cardMenu(owner.page, card(owner.page, text.pinned), "Pin to profile")
    await toastText(owner.page, /Pinned to your profile/)

    await quote(quoter.page, owner.handle, text.post, text.quote)
    await writePost(quoter.page, text.thread)
    c.ids.quote = await idOnProfile(quoter.page, quoter.handle, text.quote)
    c.ids.thread = await idOnProfile(quoter.page, quoter.handle, text.thread)

    await go(owner.page, `/${quoter.handle}/status/${c.ids.thread}`, owner.page.locator("form#reply").locator(COMPOSER_TEXT))
    const form = owner.page.locator("form#reply")
    await typeIn(form, text.reply)
    await acted(owner.page, () => form.getByRole("button", { name: "Reply", exact: true }).click())
    await toastText(owner.page, /Reply posted/)
  })

  await check(`${where}: while the account is public a stranger reaches the post by link, quote, pin, search, feed, picture and reply`, async () => {
    need(c.mediaPath, "the owner's posts from the set-up")
    await seesProtectedPosts(stranger.page, c, (step) => seen.add(step))
  })

  await check(`${where}: the owner turns on Protect my posts`, async () => {
    const message = await setProtected(owner.page, true)
    assert.match(message ?? "", /New followers need your approval/)
  })

  await check(`${where}: a stranger cannot open a protected account's post by its link, not even with another account's name in the link`, async () => {
    requireControl(seen, "open")
    await refusesPost(stranger.page, owner.handle, c.ids.post, text.post, "a stranger")
    await refusesPost(stranger.page, owner.handle, c.ids.pinned, text.pinned, "a stranger")
    await refusesPost(stranger.page, quoter.handle, c.ids.post, text.post, "a stranger (link with the quoting account's name)")
  })

  await check(`${where}: a quote of a protected post says "This post isn't available." with no text, name or link`, async () => {
    requireControl(seen, "quote")
    await hidesQuote(
      stranger.page,
      { quoter, quoteText: text.quote, quoteId: c.ids.quote, quotedText: text.post, quotedId: c.ids.post },
      "a stranger"
    )
  })

  await check(`${where}: a protected account's pinned post is not shown to a stranger, who sees only the lock`, async () => {
    requireControl(seen, "pinned")
    await openProfile(stranger.page, owner.handle)
    await stranger.page.getByText("This account is protected").waitFor()
    assert.equal(await stranger.page.locator("article").count(), 0, "posts are listed on a protected profile")
    assert.equal(await stranger.page.getByText("Pinned", { exact: true }).count(), 0, "the Pinned mark is shown on a protected profile")
    const body = await bodyText(stranger.page)
    assert.equal(body.includes(text.pinned), false, "the pinned post's text is shown on a protected profile")
    assert.equal(body.includes(text.post), false, "a post's text is shown on a protected profile")
  })

  await check(`${where}: a protected account's posts are not in search, and every tab of its feed API is locked`, async () => {
    requireControl(seen, "search")
    requireControl(seen, "feed")
    await missesInSearch(stranger.page, text.post, "a stranger")
    await missesInSearch(stranger.page, text.picture, "a stranger")
    for (const tab of PROFILE_TABS) await feedLacks(stranger.page, ownerFeed(tab), text.post, "a stranger", { locked: true })
    await feedLacks(stranger.page, ownerFeed("media"), text.picture, "a stranger", { locked: true })
  })

  await check(`${where}: the picture file of a protected post is a 404 for a stranger`, async () => {
    requireControl(seen, "media")
    await mediaRefused(stranger.page, c.mediaPath, "a stranger")
  })

  await check(`${where}: a protected account's reply under someone else's post is not listed for a stranger`, async () => {
    requireControl(seen, "reply")
    await opensPost(stranger.page, quoter.handle, c.ids.thread, text.thread)
    await stranger.page.getByText("No replies yet").waitFor()
    assert.equal(await noPost(stranger.page, text.reply, 800), true, "a protected account's reply is listed for a stranger")
    assert.equal((await bodyText(stranger.page)).includes(text.reply), false, "the text of a protected account's reply is on the page")
  })

  await check(`${where}: a pending follow request is not access`, async () => {
    await openProfile(friend.page, owner.handle)
    await acted(friend.page, () => followButton(friend.page, owner.handle).click())
    await toastText(friend.page, /^Request sent to @/)
    await withdrawButton(friend.page, owner.handle).waitFor()
    await refusesPost(friend.page, owner.handle, c.ids.post, text.post, "a person with a pending request")
    await feedLacks(friend.page, ownerFeed("posts"), text.post, "a person with a pending request", { locked: true })
    await mediaRefused(friend.page, c.mediaPath, "a person with a pending request")
  })

  await check(`${where}: once the owner accepts, that follower reaches the post by link, quote, pin, search, feed, picture and reply`, async () => {
    await openNotifications(owner.page)
    const box = requestsBox(owner.page)
    await box.getByText(`@${friend.handle} wants to follow you`).waitFor()
    await acted(owner.page, () => box.getByRole("button", { name: `Accept the request from @${friend.handle}` }).click())
    await toastText(owner.page, new RegExp(`^@${friend.handle} follows you now`, "i"))
    await seesProtectedPosts(friend.page, c)
  })

  await check(`${where}: after another person was let in, the stranger still gets the 404, the lock and the missing quote`, async () => {
    requireControl(seen, "open")
    await refusesPost(stranger.page, owner.handle, c.ids.post, text.post, "a stranger")
    await mediaRefused(stranger.page, c.mediaPath, "a stranger")
    await feedLacks(stranger.page, ownerFeed("posts"), text.post, "a stranger", { locked: true })
    await hidesQuote(
      stranger.page,
      { quoter, quoteText: text.quote, quoteId: c.ids.quote, quotedText: text.post, quotedId: c.ids.post },
      "a stranger"
    )
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// A blocked account
// ---------------------------------------------------------------------------------------------------------------------

async function blockedFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const t = phone ? "p" : "d"
  const author = await createUser({ tag: `bla${t}`, phone })
  const viewer = await createUser({ tag: `blv${t}`, phone })
  const quoter = await createUser({ tag: `blq${t}`, phone })
  const text = {
    post: uniq("Post from the blocking account"),
    picture: uniq("Picture from the blocking account"),
    viewer: uniq("Post from the blocked account"),
    quote: uniq("Quote of the blocking account"),
  }
  const alt = `Swatch ${randomWord(6)}`
  const ids = {}
  let mediaPath = null
  const seen = new Set()
  const quoteOf = () => ({ quoter, quoteText: text.quote, quoteId: ids.quote, quotedText: text.post, quotedId: ids.post })
  const authorFeed = { kind: "profile", tab: "posts", handle: author.handle }
  const viewerFeed = { kind: "profile", tab: "posts", handle: viewer.handle }

  await check(`${where}: set-up: both accounts post, and a third account quotes the first one's post`, async () => {
    await writePost(author.page, text.post)
    await writePicture(author.page, text.picture, alt, makePng(`blocked-${where}.png`, { seed: freshSeed() }))
    await writePost(viewer.page, text.viewer)
    ids.post = await idOnProfile(author.page, author.handle, text.post)
    mediaPath = await mediaPathOf(author.page, alt)
    ids.viewer = await idOnProfile(viewer.page, viewer.handle, text.viewer)
    await quote(quoter.page, author.handle, text.post, text.quote)
    ids.quote = await idOnProfile(quoter.page, quoter.handle, text.quote)
  })

  await check(`${where}: before the block, the other account reaches the post by link, quote, search, feed and picture, and the author reaches theirs`, async () => {
    await opensPost(viewer.page, author.handle, ids.post, text.post)
    seen.add("open")
    await showsQuote(viewer.page, quoteOf())
    seen.add("quote")
    await findsInSearch(viewer.page, text.post)
    seen.add("search")
    await feedHolds(viewer.page, authorFeed, text.post)
    seen.add("feed")
    await mediaOpens(viewer.page, mediaPath)
    seen.add("media")
    await opensPost(author.page, viewer.handle, ids.viewer, text.viewer)
    await feedHolds(author.page, viewerFeed, text.viewer)
    seen.add("back")
  })

  await check(`${where}: the author blocks the other account`, async () => {
    await block(author.page, viewer.handle)
  })

  await check(`${where}: the blocked person cannot open the blocker's post by link, in search, in the feed API or as a picture file`, async () => {
    requireControl(seen, "open")
    requireControl(seen, "search")
    requireControl(seen, "feed")
    requireControl(seen, "media")
    await refusesPost(viewer.page, author.handle, ids.post, text.post, "a blocked person")
    await missesInSearch(viewer.page, text.post, "a blocked person")
    await feedLacks(viewer.page, authorFeed, text.post, "a blocked person")
    await mediaRefused(viewer.page, mediaPath, "a blocked person")
  })

  await check(`${where}: a quote of the blocker's post says "This post isn't available." to the blocked person`, async () => {
    requireControl(seen, "quote")
    await hidesQuote(viewer.page, quoteOf(), "a blocked person")
  })

  await check(`${where}: the blocker cannot open the blocked person's post either, and the blocked profile lists nothing`, async () => {
    need(seen.has("back"), "the author reaching the other account's post before the block (that check did not pass)")
    await refusesPost(author.page, viewer.handle, ids.viewer, text.viewer, "the blocker")
    await feedLacks(author.page, viewerFeed, text.viewer, "the blocker")
    await openProfile(author.page, viewer.handle)
    await author.page.getByText("You blocked this account").waitFor()
    assert.equal(await author.page.locator("article").count(), 0, "a blocked profile lists posts")
    assert.equal((await bodyText(author.page)).includes(text.viewer), false, "a blocked person's post is shown on their profile")
  })

  await check(`${where}: a third person is not affected: the post and the quote still open for the quoting account`, async () => {
    await opensPost(quoter.page, author.handle, ids.post, text.post)
    await showsQuote(quoter.page, quoteOf())
  })

  await check(`${where}: Unblock opens the same links again`, async () => {
    await openProfile(author.page, viewer.handle)
    await acted(author.page, () => author.page.getByRole("button", { name: `Unblock @${viewer.handle}` }).click())
    await toastText(author.page, /^Unblocked @/)
    await opensPost(viewer.page, author.handle, ids.post, text.post)
    await mediaOpens(viewer.page, mediaPath)
    await showsQuote(viewer.page, quoteOf())
    await opensPost(author.page, viewer.handle, ids.viewer, text.viewer)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Drafts and scheduled posts
// ---------------------------------------------------------------------------------------------------------------------

async function draftsFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const t = phone ? "p" : "d"
  const author = await createUser({ tag: `dra${t}`, phone })
  const other = await createUser({ tag: `dro${t}`, phone })
  const fan = await createUser({ tag: `drf${t}`, phone })
  const text = { draft: uniq("Draft with a picture"), scheduled: uniq("Scheduled post") }
  const alt = `Swatch ${randomWord(6)}`
  const ids = {}
  let mediaPath = null
  const viewers = [
    [other, "a stranger"],
    [fan, "a follower"],
  ]

  await check(`${where}: set-up: the author saves a draft with a picture and schedules a post`, async () => {
    await follow(fan.page, author.handle)
    await openHome(author.page)
    let form = homeComposer(author.page)
    await attach(form, makePng(`draft-${where}.png`, { seed: phone ? 9 : 8 }))
    await form.locator('img[alt="Selected image"]').waitFor()
    await typeIn(form, text.draft)
    await addAlt(form, alt)
    await acted(author.page, () => form.getByRole("button", { name: "Save draft" }).click())
    await toastText(author.page, /Saved to drafts/)

    await openHome(author.page)
    form = homeComposer(author.page)
    await typeIn(form, text.scheduled)
    await showTools(form)
    await form.getByRole("button", { name: "Schedule this post" }).click()
    await form.getByText(/Goes out/).waitFor()
    await acted(author.page, () => form.getByRole("button", { name: "Schedule", exact: true }).click())
    await toastText(author.page, /Scheduled/)

    await openDrafts(author.page)
    ids.draft = await cardPostId(await waitForPost(author.page, text.draft))
    mediaPath = await mediaPathOf(author.page, alt)
    await openDrafts(author.page, "scheduled")
    ids.scheduled = await cardPostId(await waitForPost(author.page, text.scheduled))
  })

  await check(`${where}: the author opens the draft and the scheduled post by link and sees the draft's picture`, async () => {
    need(mediaPath, "the draft's picture")
    await opensPost(author.page, author.handle, ids.draft, text.draft)
    await author.page.getByText("Draft. Only you can see it.").waitFor()
    await mediaOpens(author.page, mediaPath)
    await opensPost(author.page, author.handle, ids.scheduled, text.scheduled)
    await author.page.getByText(/Goes out/).first().waitFor()
  })

  await check(`${where}: a stranger and a follower cannot open a draft or a scheduled post by link`, async () => {
    need(ids.scheduled, "the scheduled post's id")
    for (const [person, who] of viewers) {
      await refusesPost(person.page, author.handle, ids.draft, text.draft, who)
      await refusesPost(person.page, author.handle, ids.scheduled, text.scheduled, who)
    }
  })

  await check(`${where}: a draft and a scheduled post are not on the profile, in search or in the feed API for anyone else`, async () => {
    need(ids.scheduled, "the scheduled post's id")
    for (const [person, who] of viewers) {
      await openProfile(person.page, author.handle)
      assert.equal(await noPost(person.page, text.draft, 600), true, `${who}: a draft is on the author's profile`)
      assert.equal(await cardCount(person.page, text.scheduled), 0, `${who}: a scheduled post is on the author's profile`)
      await missesInSearch(person.page, text.draft, who)
      await missesInSearch(person.page, text.scheduled, who)
      for (const tab of PROFILE_TABS) {
        const feed = await feedOf(person.page, { kind: "profile", tab, handle: author.handle })
        assert.equal(feed.status, 200, `${who}: the ${tab} feed answered ${feed.status}`)
        assert.equal(feed.text.includes(text.draft) || feed.text.includes(text.scheduled), false, `${who}: the ${tab} feed carries a draft or a scheduled post`)
      }
    }
  })

  await check(`${where}: the picture of a draft is a 404 for everyone but the author`, async () => {
    need(mediaPath, "the draft's picture")
    for (const [person, who] of viewers) await mediaRefused(person.page, mediaPath, who)
  })

  await check(`${where}: another person's Drafts page lists none of the author's drafts`, async () => {
    need(ids.scheduled, "the scheduled post's id")
    for (const [person] of viewers) {
      await openDrafts(person.page)
      assert.equal(await cardCount(person.page, text.draft), 0, "someone else's draft is on another person's Drafts page")
      await openDrafts(person.page, "scheduled")
      assert.equal(await cardCount(person.page, text.scheduled), 0, "someone else's scheduled post is on another person's Scheduled list")
    }
  })

  await check(`${where}: Publish now opens the same links, picture included, to everyone`, async () => {
    await openDrafts(author.page)
    await acted(author.page, () =>
      card(author.page, text.draft)
        .locator("xpath=..")
        .getByRole("button", { name: "Publish now" })
        .click()
    )
    await toastText(author.page, /Draft published/)
    await openDrafts(author.page, "scheduled")
    await acted(author.page, () =>
      card(author.page, text.scheduled)
        .locator("xpath=..")
        .getByRole("button", { name: "Publish now" })
        .click()
    )
    await toastText(author.page, /Published now/)
    for (const [person] of viewers) {
      await opensPost(person.page, author.handle, ids.draft, text.draft)
      await opensPost(person.page, author.handle, ids.scheduled, text.scheduled)
      await mediaOpens(person.page, mediaPath)
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// The Likes tab
// ---------------------------------------------------------------------------------------------------------------------

async function likesFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const t = phone ? "p" : "d"
  const liker = await createUser({ tag: `lkl${t}`, phone })
  const writer = await createUser({ tag: `lkw${t}`, phone })
  const viewer = await createUser({ tag: `lkv${t}`, phone })
  const liked = uniq("Post that gets liked")
  const likesFeed = { kind: "profile", tab: "likes", handle: liker.handle }
  const sections = (page) => page.getByRole("navigation", { name: "Profile sections" })
  let controlled = false

  await check(`${where}: the owner's own profile has a Likes tab that lists what they liked, and so does the feed API`, async () => {
    await writePost(writer.page, liked)
    await openProfile(liker.page, writer.handle)
    const target = await waitForPost(liker.page, liked)
    await acted(liker.page, () => likeButton(target).click())
    await target.getByRole("button", { name: /^Unlike, 1 like$/ }).waitFor()
    await openProfile(liker.page, liker.handle)
    await sections(liker.page).getByRole("link", { name: "Likes" }).waitFor()
    await openProfile(liker.page, liker.handle, "likes")
    await waitForPost(liker.page, liked)
    await feedHolds(liker.page, likesFeed, liked)
    controlled = true
  })

  await check(`${where}: on someone else's profile there is no Likes tab, and ?tab=likes and the feed API show none of their likes`, async () => {
    need(controlled, "the Likes tab showing the liked post to its owner (that check did not pass)")
    await follow(viewer.page, liker.handle)
    await openProfile(viewer.page, liker.handle)
    for (const name of ["Posts", "Replies", "Media", "Reposts"]) await sections(viewer.page).getByRole("link", { name, exact: true }).waitFor()
    assert.equal(await sections(viewer.page).getByRole("link", { name: "Likes" }).count(), 0, "a Likes tab is offered on someone else's profile")
    await openProfile(viewer.page, liker.handle, "likes")
    assert.equal(await noPost(viewer.page, liked, 1200), true, "the liked post is listed on someone else's profile through ?tab=likes")
    assert.equal(await sections(viewer.page).getByRole("link", { name: "Likes" }).count(), 0, "?tab=likes opens a Likes tab on someone else's profile")
    await feedLacks(viewer.page, likesFeed, liked, "another person")
    await feedLacks(writer.page, likesFeed, liked, "the author of the liked post")
  })
}
