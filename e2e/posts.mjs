// Posts end to end: text, image, poll, draft, scheduled, reply, quote, repost, like, bookmark, pin, highlight, edit, delete,
// undo, and the notifications they cause. Everything runs on a computer and on a phone, except the schedule wait.
import { area, assert, check, guard, need, note } from "./lib/harness.mjs"
import { BASE, RUN_ID, randomWord, sleep } from "./lib/env.mjs"
import { closeVisitor, newTab } from "./lib/browser.mjs"
import { createUser } from "./lib/accounts.mjs"
import { databaseProblem, keepLinkPreview, moveSchedule, postIdByBody, postState } from "./lib/db.mjs"
import { makeExifJpeg, makeFakePng, makePng } from "./lib/files.mjs"
import {
  COMPOSER_TEXT,
  addAlt,
  attach,
  bookmarkButton,
  card,
  cardMenu,
  cardPostId,
  fillChoice,
  homeComposer,
  likeButton,
  noPost,
  openDrafts,
  openHome,
  openProfile,
  replyButton,
  repostTrigger,
  startPoll,
  typeIn,
  waitForPost,
  writePost,
} from "./lib/posts.mjs"
import { idleOnSettings, recordBanners, sawBanner } from "./lib/live.mjs"
import { follow } from "./lib/people.mjs"
import { acted, bodyText, go, ready, toastText } from "./lib/ui.mjs"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

export async function run() {
  area("posts")
  for (const phone of [false, true]) await guard(`posts on a ${phone ? "phone" : "computer"}`, () => postFlows({ phone }))
  await guard("scheduled post", scheduledPost)
}

async function postFlows({ phone }) {
  const where = phone ? "phone" : "desktop"
  const author = await createUser({ tag: phone ? "pap" : "pad", phone })
  const reader = await createUser({ tag: phone ? "prp" : "prd", phone })
  const shot = phone ? 1 : 0
  // -------------------------------------------------------------------------------------------------- text
  const plain = uniq("Plain post")
  await check(`${where}: a text post shows on the home page, on the profile, and to another person`, async () => {
    await writePost(author.page, plain)
    await waitForPost(author.page, plain)
    await openProfile(author.page, author.handle)
    await waitForPost(author.page, plain)
    await openProfile(reader.page, author.handle)
    await waitForPost(reader.page, plain)
  })

  await check(`${where}: a post over 25,000 characters cannot be sent`, async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, "x".repeat(25001))
    const send = form.getByRole("button", { name: "Post", exact: true })
    assert.equal(await send.isDisabled(), true, "the Post button is enabled with 25,001 characters")
    await form.getByText(/1 character over the limit/).first().waitFor()
    await typeIn(form, "x".repeat(25000))
    assert.equal(await send.isDisabled(), false, "the Post button is disabled with exactly 25,000 characters")
    await typeIn(form, "")
  })

  // A long post folds after its first lines. Show more opens the rest, and Show less folds it again.
  const longHead = uniq("Long post opening")
  const longTail = `LONG-END-${RUN_ID}${randomWord(4)}`
  await check(`${where}: a long post folds, and Show more and Show less open and close the rest`, async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, `${longHead}\n\n${"A longer paragraph of plain text to fill the post. ".repeat(14)}${longTail}`)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /Posted/)
    await openProfile(author.page, author.handle)
    const post = await waitForPost(author.page, longHead)
    await post.getByRole("button", { name: "Show more", exact: true }).click()
    await post.getByRole("button", { name: "Show less", exact: true }).waitFor()
    await post.getByRole("button", { name: "Show less", exact: true }).click()
    await post.getByRole("button", { name: "Show more", exact: true }).waitFor()
  })

  // A thread posts its parts in order. The later part sits in the feed with a link back to the thread's start.
  const threadHead = uniq("Thread opener")
  const threadTail = uniq("Thread closer")
  await check(`${where}: a thread posts in order, and its later part links to the thread`, async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, threadHead)
    await form.getByRole("button", { name: "Add to thread", exact: true }).click()
    await author.page.getByRole("textbox", { name: "Thread part 2 of 2" }).fill(threadTail)
    await acted(author.page, () => form.getByRole("button", { name: "Post all", exact: true }).click())
    await toastText(author.page, /Thread posted/)
    await openProfile(author.page, author.handle)
    const tail = await waitForPost(author.page, threadTail)
    await tail.getByRole("link", { name: "Show this thread", exact: true }).click()
    await author.page.waitForURL(/\/status\//)
    await waitForPost(author.page, threadHead)
    await openProfile(reader.page, author.handle)
    await waitForPost(reader.page, threadTail)
  })

  // -------------------------------------------------------------------------------------------------- image
  const withImage = uniq("Picture post")
  const altText = `A gradient swatch ${randomWord(5)}`
  await check(`${where}: a photo's location and camera details are removed when it is uploaded`, async () => {
    const marker = `RHENKO-PLACE-${RUN_ID}${randomWord(6)}`
    const jpeg = await makeExifJpeg(`exif-${where}.jpg`, marker)
    const caption = uniq("Photo without its details")
    await openHome(author.page)
    const form = homeComposer(author.page)
    await attach(form, jpeg)
    await form.locator('img[alt="Selected image"]').waitFor()
    await typeIn(form, caption)
    await addAlt(form, `Alt for ${caption}`)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /^Posted\./)
    await openProfile(reader.page, author.handle)
    const shown = await waitForPost(reader.page, caption)
    const src = await shown.locator(`img[alt="Alt for ${caption}"]`).getAttribute("src")
    assert.ok(src, "the photo has no picture address")
    const stored = await reader.page.request.get(new URL(src, reader.page.url()).toString())
    assert.equal(stored.status(), 200, "the stored photo did not load")
    const bytes = await stored.body()
    assert.equal(bytes.includes(Buffer.from(marker)), false, "the photo still carries its EXIF text")
    assert.equal(bytes.includes(Buffer.from("Exif\0\0")), false, "the photo still has an EXIF block")
  })

  await check(`${where}: a post with an image and alt text shows the picture to everyone`, async () => {
    const png = makePng(`swatch-${where}.png`, { seed: shot + 1 })
    await openHome(author.page)
    const form = homeComposer(author.page)
    await attach(form, png)
    await form.locator('img[alt="Selected image"]').waitFor()
    await typeIn(form, withImage)
    await addAlt(form, altText)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /^Posted\./)
    await openProfile(reader.page, author.handle)
    const shown = await waitForPost(reader.page, withImage)
    const picture = shown.locator(`img[alt="${altText}"]`)
    await picture.scrollIntoViewIfNeeded()
    await picture.waitFor()
    await reader.page.waitForFunction(
      (alt) => {
        const image = document.querySelector(`img[alt="${alt}"]`)
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      },
      altText
    )
  })

  await check(`${where}: a link shows its page title and a picture kept on this site`, async () => {
    const link = `https://example.com/story-${RUN_ID}-${where}`
    const title = uniq("Preview headline")
    await keepLinkPreview({ link, title, description: "A short line about the page.", site: "example.com", picture: makePng(`preview-${where}.png`, { seed: shot + 5 }) })
    const body = uniq("Read this") + " " + link
    await writePost(author.page, body)
    await openProfile(reader.page, author.handle)
    const shown = await waitForPost(reader.page, body)
    const preview = shown.locator(`a[href="${link}"]`)
    await preview.getByText(title).waitFor()
    const picture = preview.locator("img")
    await picture.scrollIntoViewIfNeeded()
    await picture.waitFor()
    await reader.page.waitForFunction(
      () => {
        const image = document.querySelector("article a[href^=\"https://example.com/story-\"] img")
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      },
      null,
      { timeout: 20_000 }
    )
    const source = await picture.getAttribute("src")
    // The page asks for a copy at the width its frame needs (?w=), kept on this site. The copy is what the reader gets.
    assert.match(source ?? "", /^\/media\/[a-f0-9]{32}\.png(\?w=\d+)?$/, "the picture is not kept on this site")
  })

  await check(`${where}: the Media tab lists the picture post`, async () => {
    await openProfile(reader.page, author.handle, "media")
    await waitForPost(reader.page, withImage)
  })

  await check(`${where}: a picture is sent as a WebP at the width its frame needs, and the original stays available`, async () => {
    const shown = await waitForPost(reader.page, withImage)
    // The feed's photo frames ask for 1280 pixels. Avatars ask for smaller copies and are not this picture.
    const src = await shown.locator("img[src$='?w=1280']").first().getAttribute("src")
    assert.match(src ?? "", /^\/media\/[a-f0-9]{32}\.(jpg|png|webp)\?w=1280$/, `the feed asks for ${src}`)
    const copy = await reader.page.request.get(`${BASE}${src}`)
    assert.equal(copy.status(), 200, `the copy answers ${copy.status()}`)
    assert.match(copy.headers()["content-type"] ?? "", /^image\/webp/, "the copy is not WebP")
    const original = await reader.page.request.get(`${BASE}${src.split("?")[0]}`)
    assert.equal(original.status(), 200, `the original answers ${original.status()}`)
    assert.match(original.headers()["content-type"] ?? "", /^image\/(jpeg|png|webp)/, "the original is not a picture")
  })

  await check(`${where}: a file that only pretends to be a picture is refused`, async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    // The browser cannot read the file, so framing refuses it before it is sent. The refusal stays on screen and the
    // post gets no picture.
    await form.locator("input[type=file]").setInputFiles(makeFakePng(`fake-${where}.png`))
    const framing = author.page.getByRole("dialog", { name: "Frame your photo" })
    await framing.getByText("That picture could not be read.").waitFor()
    await framing.getByRole("button", { name: "Close", exact: true }).click()
    await framing.waitFor({ state: "detached" })
    assert.equal(await form.locator("img[alt='Selected image']").count(), 0, "a picture that could not be read was attached")
    await typeIn(form, "")
  })

  // -------------------------------------------------------------------------------------------------- poll
  const pollText = uniq("Poll post")
  const choices = [`Tea ${randomWord(3)}`, `Coffee ${randomWord(3)}`]
  await check(`${where}: a poll needs two choices, then posts with its choices`, async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, pollText)
    await startPoll(form, [choices[0]], "30 minutes")
    assert.equal(await form.getByRole("button", { name: "Post", exact: true }).isDisabled(), true, "a poll with one choice can be posted")
    await fillChoice(form, 2, choices[1])
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /^Posted\./)
    await openProfile(author.page, author.handle)
    const shown = await waitForPost(author.page, pollText)
    for (const choice of choices) await shown.getByRole("button", { name: choice }).waitFor()
  })

  await check(`${where}: voting in a poll shows the results and keeps the vote`, async () => {
    await openProfile(reader.page, author.handle)
    const shown = await waitForPost(reader.page, pollText)
    await acted(reader.page, () => shown.getByRole("button", { name: choices[0] }).click())
    await shown.getByText(/1 vote/).waitFor()
    await shown.getByText("100%").first().waitFor()
    await reader.page.reload()
    const again = await waitForPost(reader.page, pollText)
    await again.getByText(/1 vote/).waitFor()
    assert.equal(await again.getByRole("button", { name: choices[0] }).count(), 0, "the choices can be voted on again after voting")
  })

  // -------------------------------------------------------------------------------------------------- draft
  const draftText = uniq("Draft post")
  await check(`${where}: a draft is saved, is private, and publishes on request`, async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, draftText)
    await acted(author.page, () => form.getByRole("button", { name: "Save draft" }).click())
    await toastText(author.page, /Saved to drafts/)
    await openDrafts(author.page)
    const item = card(author.page, draftText)
    await item.waitFor()
    await item.getByText("Draft. Only you can see it.").waitFor()
    await openProfile(reader.page, author.handle)
    assert.equal(await noPost(reader.page, draftText), true, "a draft shows on the author's profile")
    await openDrafts(author.page)
    const row = card(author.page, draftText).locator("xpath=..")
    await acted(author.page, () => row.getByRole("button", { name: "Publish now" }).click())
    await toastText(author.page, /Draft published/)
    await openProfile(reader.page, author.handle)
    await waitForPost(reader.page, draftText)
  })

  await check(`${where}: a draft can be deleted`, async () => {
    const gone = uniq("Draft to delete")
    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, gone)
    await acted(author.page, () => form.getByRole("button", { name: "Save draft" }).click())
    await toastText(author.page, /Saved to drafts/)
    await openDrafts(author.page)
    const row = card(author.page, gone).locator("xpath=..")
    await row.getByRole("button", { name: "Delete", exact: true }).click()
    const dialog = author.page.getByRole("dialog", { name: "Delete this draft?" })
    await dialog.waitFor()
    await acted(author.page, () => dialog.getByRole("button", { name: "Delete", exact: true }).click())
    await author.page.locator("article").filter({ hasText: gone }).waitFor({ state: "detached" })
  })

  // -------------------------------------------------------------------------------------------------- reply
  const replyText = uniq("Reply from the card")
  const replyFromPage = uniq("Reply from the post page")
  await check(`${where}: a reply from the post card appears under the post`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, plain)
    await replyButton(target).click()
    const dialog = reader.page.getByRole("dialog", { name: "Reply" })
    await dialog.waitFor()
    await typeIn(dialog, replyText)
    await acted(reader.page, () => dialog.getByRole("button", { name: "Reply", exact: true }).click())
    await toastText(reader.page, /Reply posted/)
    await openProfile(reader.page, author.handle)
    const updated = await waitForPost(reader.page, plain)
    await updated.getByRole("button", { name: /^Reply, 1 reply$/ }).waitFor()
  })

  await check(`${where}: a reply from the post's own page is listed with the post above it`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, plain)
    const id = await cardPostId(target)
    await go(reader.page, `/${author.handle}/status/${id}`, reader.page.locator("form#reply").locator(COMPOSER_TEXT))
    await typeIn(reader.page.locator("form#reply"), replyFromPage)
    await acted(reader.page, () => reader.page.locator("form#reply").getByRole("button", { name: "Reply", exact: true }).click())
    await toastText(reader.page, /Reply posted/)
    await waitForPost(reader.page, replyFromPage)
    await waitForPost(reader.page, replyText)
  })

  const noteText = uniq("Context a reader adds")
  await check(`${where}: a post with no community notes is one line, and a note is written from it`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, plain)
    const id = await cardPostId(target)
    await go(reader.page, `/${author.handle}/status/${id}`, reader.page.locator("#notes"))
    const notes = reader.page.locator("#notes")
    await notes.getByText("No community notes on this post yet.", { exact: true }).waitFor()
    const box = await notes.boundingBox()
    assert.ok(box && box.height < 110, `the empty notes take ${Math.round(box?.height ?? 0)}px, more than one line`)
    // The replies come right after the line, so the reply box is directly below it.
    const composer = await reader.page.locator("form#reply").boundingBox()
    assert.ok(composer && composer.y - (box.y + box.height) < 40, "the reply box is not directly under the empty notes")
    assert.equal(await reader.page.locator("#community-note").count(), 0, "the note form is open before it is asked for")
    await notes.getByRole("button", { name: "Write a note", exact: true }).click()
    await reader.page.locator("#community-note").fill(noteText)
    await acted(reader.page, () => reader.page.getByRole("button", { name: "Add note", exact: true }).click())
    await toastText(reader.page, /^Note added\./)
    await reader.page.locator("#notes").getByText(noteText).waitFor()
    await reader.page.locator("#notes").getByText("Needs more ratings", { exact: true }).waitFor()
  })

  await check(`${where}: the Replies tab lists the reply with who it answers`, async () => {
    await openProfile(reader.page, reader.handle, "replies")
    const row = await waitForPost(reader.page, replyText)
    await row.getByText(`@${author.handle}`).first().waitFor()
  })

  // -------------------------------------------------------------------------------------------------- quote
  const quoteText = uniq("Quote with a comment")
  await check(`${where}: a quote shows the comment and the quoted post`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, plain)
    const dialog = reader.page.getByRole("dialog", { name: "Quote post" })
    // A live update can re-render the open menu under the pointer, so a click may land on the old item. Open it again then.
    const quoteItem = reader.page.getByRole("menuitem", { name: "Quote post" })
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!(await quoteItem.isVisible())) await repostTrigger(target).click()
      await quoteItem.click()
      if (await dialog.waitFor({ timeout: 5000 }).then(() => true, () => false)) break
    }
    await dialog.waitFor()
    await typeIn(dialog, quoteText)
    await acted(reader.page, () => dialog.getByRole("button", { name: "Quote", exact: true }).click())
    await toastText(reader.page, /Quote posted/)
    await openProfile(reader.page, reader.handle)
    const mine = await waitForPost(reader.page, quoteText)
    await mine.getByText(plain).first().waitFor()
    // The quoted post is a link named for its author, so a screen reader announces who it is.
    await mine.getByRole("link", { name: `Open ${author.name}'s post`, exact: true }).waitFor()
  })

  // -------------------------------------------------------------------------------------------------- repost
  await check(`${where}: a repost shows on the reposter's Reposts tab and can be undone`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, withImage)
    const repostedId = await cardPostId(target)
    // Wait for the repost itself to answer, not just any action: the menu click is the one that changes the list.
    const reposted = reader.page.waitForResponse((r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes(repostedId))
    await repostTrigger(target).click()
    await reader.page.getByRole("menuitem", { name: "Repost", exact: true }).click()
    await reposted
    await target.getByRole("button", { name: /^Repost, 1 repost$/ }).waitFor()
    await openProfile(reader.page, reader.handle, "reposts")
    const listed = await waitForPost(reader.page, withImage)
    await listed.getByText("You reposted").waitFor()
    await openProfile(reader.page, author.handle)
    const again = await waitForPost(reader.page, withImage)
    const undone = reader.page.waitForResponse((r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes(repostedId))
    await repostTrigger(again).click()
    await reader.page.getByRole("menuitem", { name: "Undo repost" }).click()
    await undone
    await openProfile(reader.page, reader.handle, "reposts")
    assert.equal(await noPost(reader.page, withImage), true, "the repost is still listed after it was undone")
  })

  // -------------------------------------------------------------------------------------------------- like and the banner
  await check(`${where}: a like changes the count, survives a reload, and can be taken back`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, pollText)
    await acted(reader.page, () => likeButton(target).click())
    await target.getByRole("button", { name: /^Unlike, 1 like$/ }).waitFor()
    await reader.page.reload()
    const reloaded = await waitForPost(reader.page, pollText)
    await reloaded.getByRole("button", { name: /^Unlike, 1 like$/ }).waitFor()
    await acted(reader.page, () => likeButton(reloaded).click())
    await reloaded.getByRole("button", { name: /^Like, 0 likes$/ }).waitFor()
  })

  await check(`${where}: a like shows a banner at once, and a row on the notifications page`, async () => {
    // The author waits on a page that is not a feed, so only the live event stream can tell it about the like.
    await idleOnSettings(author.page)
    await recordBanners(author.page)
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, plain)
    await acted(reader.page, () => likeButton(target).click())
    const shown = await sawBanner(author.page, "liked your post")
    assert.ok(shown, "no banner came for the like on a page that is not a feed")
    assert.match(shown, new RegExp(reader.name), "the banner does not name who liked the post")
    await go(author.page, "/notifications", author.page.getByRole("navigation", { name: "Sections" }))
    const row = author.page.getByRole("link").filter({ hasText: "liked your post" }).filter({ hasText: reader.name }).filter({ hasText: plain }).first()
    await row.waitFor()
  })

  await check(`${where}: a mention is listed on the Mentions tab`, async () => {
    const mention = uniq(`Hello @${author.handle}`)
    await writePost(reader.page, mention)
    await go(author.page, "/notifications?tab=mentions", author.page.getByRole("navigation", { name: "Sections" }))
    await author.page.getByRole("link").filter({ hasText: "mentioned you" }).filter({ hasText: reader.name }).first().waitFor()
  })

  // -------------------------------------------------------------------------------------------------- bookmark
  await check(`${where}: a bookmark is listed on the Bookmarks page and can be removed`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, plain)
    await acted(reader.page, () => bookmarkButton(target).click())
    await toastText(reader.page, /Saved to bookmarks/)
    await go(reader.page, "/bookmarks", reader.page.locator("main"))
    const saved = await waitForPost(reader.page, plain)
    // The page is hydrated before its buttons are: a click that lands first does nothing, so wait for this one.
    await ready(bookmarkButton(saved))
    await acted(reader.page, () => bookmarkButton(saved).click())
    await toastText(reader.page, /Removed from bookmarks/)
    await reader.page.reload()
    assert.equal(await noPost(reader.page, plain), true, "the post is still on the Bookmarks page after it was removed")
  })

  // -------------------------------------------------------------------------------------------------- pin and highlight
  await check(`${where}: a pinned post sits on top of the profile for everyone, and unpins`, async () => {
    await openProfile(author.page, author.handle)
    const target = await waitForPost(author.page, plain)
    await cardMenu(author.page, target, "Pin to profile")
    await toastText(author.page, /Pinned to your profile/)
    await openProfile(reader.page, author.handle)
    const pinned = reader.page.locator("article").first()
    await pinned.getByText("Pinned", { exact: true }).waitFor()
    assert.match(await pinned.innerText(), new RegExp(plain.slice(0, 12)), "the first card on the profile is not the pinned post")
    await openProfile(author.page, author.handle)
    const own = author.page.locator("article").first()
    await cardMenu(author.page, own, "Unpin from profile")
    await toastText(author.page, /Unpinned/)
    await openProfile(reader.page, author.handle)
    assert.equal(await reader.page.locator("article").getByText("Pinned", { exact: true }).count(), 0, "the Pinned mark is still shown after unpinning")
  })

  await check(`${where}: a highlighted post is listed under Highlights`, async () => {
    await openProfile(author.page, author.handle)
    const target = await waitForPost(author.page, plain)
    await cardMenu(author.page, target, "Add to highlights")
    await toastText(author.page, /Added to highlights/)
    await openProfile(reader.page, author.handle, "highlights")
    await waitForPost(reader.page, plain)
    assert.equal(await reader.page.locator("article").filter({ hasText: withImage }).count(), 0, "a post that was not highlighted is listed under Highlights")
    await openProfile(author.page, author.handle, "highlights")
    const shown = await waitForPost(author.page, plain)
    await cardMenu(author.page, shown, "Remove from highlights")
    await toastText(author.page, /Removed from highlights/)
  })

  // -------------------------------------------------------------------------------------------------- edit
  const original = uniq("Before the edit")
  const edited = uniq("After the edit")
  await check(`${where}: an edit within the window changes the text and keeps the history`, async () => {
    await writePost(author.page, original)
    await openProfile(author.page, author.handle)
    const target = await waitForPost(author.page, original)
    await cardMenu(author.page, target, "Edit post")
    const dialog = author.page.getByRole("dialog", { name: "Edit post" })
    await dialog.waitFor()
    await dialog.getByLabel("Post text").fill(edited)
    await acted(author.page, () => dialog.getByRole("button", { name: "Save", exact: true }).click())
    await toastText(author.page, /Post updated/)
    const updated = await waitForPost(author.page, edited)
    assert.equal(await author.page.locator("article").filter({ hasText: original }).count(), 0, "the old text is still shown")
    await updated.getByRole("button", { name: /Edited/ }).click()
    const history = author.page.getByRole("dialog", { name: "Edit history" })
    await history.waitFor()
    await history.getByText(original).waitFor()
    await history.getByText(edited).waitFor()
    await history.getByText(/Current version/).waitFor()
    await history.getByRole("button", { name: "Close" }).click()
  })

  await check(`${where}: only the author sees Edit, Pin and Delete`, async () => {
    await openProfile(reader.page, author.handle)
    const target = await waitForPost(reader.page, plain)
    await target.getByRole("button", { name: "More options" }).click()
    await reader.page.getByRole("menuitem", { name: `Mute @${author.handle}` }).waitFor()
    for (const hidden of ["Edit post", "Delete post", "Pin to profile"]) {
      assert.equal(await reader.page.getByRole("menuitem", { name: hidden }).count(), 0, `"${hidden}" is offered on someone else's post`)
    }
    await reader.page.keyboard.press("Escape")
  })

  // -------------------------------------------------------------------------------------------------- delete and undo
  await check(`${where}: deleting a post asks first, then removes it everywhere`, async () => {
    await openProfile(author.page, author.handle)
    const target = await waitForPost(author.page, edited)
    await cardMenu(author.page, target, "Delete post")
    const dialog = author.page.getByRole("dialog", { name: "Delete post?" })
    await dialog.waitFor()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await dialog.waitFor({ state: "detached" })
    await waitForPost(author.page, edited)
    await cardMenu(author.page, target, "Delete post")
    await dialog.waitFor()
    await acted(author.page, () => dialog.getByRole("button", { name: "Delete", exact: true }).click())
    await author.page.locator("article").filter({ hasText: edited }).waitFor({ state: "detached" })
    await openProfile(reader.page, author.handle)
    assert.equal(await noPost(reader.page, edited), true, "the deleted post is still shown to another person")
  })

  await check(`${where}: Undo right after posting takes the post back`, async () => {
    const oops = uniq("Posted by mistake")
    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, oops)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    const toast = author.page.locator("[data-sonner-toast]").filter({ hasText: /^Posted\./ }).first()
    await toast.waitFor()
    await acted(author.page, () => toast.getByRole("button", { name: "Undo" }).click())
    await toastText(author.page, /Post deleted/)
    await openProfile(reader.page, author.handle)
    assert.equal(await noPost(reader.page, oops), true, "a post that was undone is still shown")
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// A scheduled post goes out on time without anyone opening a feed
// ---------------------------------------------------------------------------------------------------------------------

// The product refuses a schedule less than five minutes ahead and the page offers quarter-hour steps, so the schedule is
// made through the page at the shortest time it allows, and then that one post is moved to 30 seconds from now directly in
// the database. After that nothing opens a feed: the page that waits is /settings, and the wait ends when the server's
// own background loop has published the post (read from the database). Then a fresh tab loads the profile.
async function scheduledPost() {
  const author = await createUser({ tag: "sca" })
  const follower = await createUser({ tag: "scf" })
  const text = uniq("Scheduled post")
  let id = null
  let movedAt = 0
  let bannerSeen = false
  await check("scheduled: the Scheduled list shows it, and the profile does not, until it goes out", async () => {
    await follow(follower.page, author.handle)
    await acted(follower.page, () => follower.page.getByRole("button", { name: `Get post notifications for @${author.handle}` }).click())
    await toastText(follower.page, /hear about new posts/i)

    await openHome(author.page)
    const form = homeComposer(author.page)
    await typeIn(form, text)
    await form.getByRole("button", { name: "Schedule this post" }).click()
    await form.getByText(/Goes out/).waitFor()
    await acted(author.page, () => form.getByRole("button", { name: "Schedule", exact: true }).click())
    await toastText(author.page, /Scheduled/)
    await openDrafts(author.page, "scheduled")
    await card(author.page, text).getByText("Goes out").first().waitFor()

    await openProfile(follower.page, author.handle)
    assert.equal(await noPost(follower.page, text, 800), true, "a scheduled post shows on the profile before its time")
  })

  await check("scheduled: moved to 30 seconds from now, the server publishes it by itself", async () => {
    const problem = databaseProblem()
    assert.equal(problem, null, problem ?? "")
    id = need(await postIdByBody(author.handle, text), "the scheduled post's id")
    // From here on, no page loads a feed. The follower waits on /settings with the live stream open.
    await idleOnSettings(follower.page)
    await idleOnSettings(author.page)
    await recordBanners(follower.page)
    const watching = sawBanner(follower.page, "posted", 80_000).then(
      (text) => text !== null,
      () => false
    )
    assert.equal(await moveSchedule(id, Date.now() + 30_000), true, "the post was not waiting for its time any more")
    movedAt = Date.now()
    let state = null
    while (Date.now() - movedAt < 70_000) {
      await sleep(2000)
      state = await postState(id)
      if (state && state.publishAt === null && !state.draft) break
    }
    const waited = (Date.now() - movedAt) / 1000
    note(`the post was published ${waited.toFixed(0)} seconds after its time was set to 30 seconds ahead`)
    assert.ok(state && state.publishAt === null && !state.draft, "the post was still waiting after 70 seconds, so nothing publishes scheduled posts in the background")
    assert.ok(waited <= 55, `the post went out after ${waited.toFixed(0)} seconds; a post due in 30 seconds should be out by about 45`)
    bannerSeen = await Promise.race([watching, sleep(9000).then(() => false)])
  })

  await check("scheduled: a fresh tab that loads the profile directly shows the post", async () => {
    need(id, "the scheduled post")
    const fresh = await newTab(follower, "fresh-profile")
    try {
      await fresh.goto(`/${author.handle}`)
      const shown = await waitForPost(fresh, text, { timeout: 15_000 })
      assert.equal(await shown.getByText("Goes out").count(), 0, "the post still says it is waiting")
      await shown.getByRole("link", { name: author.name }).first().waitFor()
    } finally {
      await fresh.close()
    }
  })

  await check("scheduled: the follower who turned on post notifications got a banner on a page that is not a feed", async () => {
    need(id, "the scheduled post")
    assert.equal(bannerSeen, true, "no banner appeared on the follower's /settings page within 9 seconds of the post going out")
    await go(follower.page, "/notifications", follower.page.getByRole("navigation", { name: "Sections" }))
    await follower.page.getByRole("link").filter({ hasText: author.name }).filter({ hasText: "posted" }).first().waitFor()
  })

  await check("scheduled: the author's Scheduled list no longer holds it", async () => {
    await openDrafts(author.page, "scheduled")
    assert.equal(await noPost(author.page, text, 800), true, "the published post is still listed as scheduled")
    const body = await bodyText(author.page)
    assert.match(body, /Nothing scheduled/)
  })

  await check("phone: the profile page and the Scheduled list fit the screen", async () => {
    const phone = await createUser({ tag: "scp", phone: true })
    try {
      await openProfile(phone.page, author.handle)
      await waitForPost(phone.page, text)
      await openDrafts(phone.page, "scheduled")
    } finally {
      await closeVisitor(phone)
    }
  })
}
