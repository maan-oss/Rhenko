// Stickers on a photo: emoji, short text and hashtags, placed in the composer, kept with the photo when it is posted, and drawn
// over the photo in the feed. A sticker is moved with the pointer, resized from the keyboard, and removed by dropping it on the
// bin, and the phone layout of the sticker controls is checked.
import { area, assert, check, guard } from "./lib/harness.mjs"
import { RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { postIdByBody, query } from "./lib/db.mjs"
import { makePng } from "./lib/files.mjs"
import { attach, homeComposer, openHome, typeIn, waitForPost } from "./lib/posts.mjs"
import { acted, toastText } from "./lib/ui.mjs"

export async function run() {
  area("stickers")
  await guard("emoji, text and hashtag stickers are added in the composer, and the photo is posted with all three", stickersPosted)
  await guard("a sticker is dragged onto the photo's middle line, resized from the keyboard, and removed by dropping it on the bin", movedAndBinned)
  await guard("on a phone, the sticker controls fit the screen with no sideways scrolling", stickersOnPhone)
}

async function openPhotoWithStickers(page, marker) {
  const png = await makePng(`sticker-${marker}.png`, { width: 320, height: 200, seed: 3 })
  await openHome(page)
  const form = homeComposer(page)
  await attach(form, png)
  await form.locator('img[alt="Selected image"]').waitFor()
  // The sticker controls open once the photo has loaded and its shape is known.
  await form.getByRole("button", { name: "Stickers", exact: true }).click()
  return form
}

async function openTray(page, form) {
  await form.getByRole("button", { name: "Add a sticker", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Add a sticker" })
  await dialog.waitFor()
  return dialog
}

async function addEmoji(page, form, name) {
  const dialog = await openTray(page, form)
  await dialog.getByRole("button", { name: `Add ${name}`, exact: true }).click()
  await dialog.waitFor({ state: "detached" })
}

async function addText(page, form, words, look) {
  const dialog = await openTray(page, form)
  await dialog.getByLabel("Text sticker", { exact: true }).fill(words)
  await dialog.getByRole("button", { name: look, exact: true }).click()
  await dialog.getByRole("button", { name: "Add text", exact: true }).click()
  await dialog.waitFor({ state: "detached" })
}

async function addHashtag(page, form, tag) {
  const dialog = await openTray(page, form)
  await dialog.getByLabel("Hashtag", { exact: true }).fill(tag)
  await dialog.getByRole("button", { name: "Add hashtag", exact: true }).click()
  await dialog.waitFor({ state: "detached" })
}

async function stickerSet(postId) {
  const rows = await query("SELECT stickers FROM post_media WHERE post_id = ? AND stickers IS NOT NULL", postId)
  assert.equal(rows.length, 1, "the photo's stickers were not kept")
  return JSON.parse(rows[0].stickers)
}

function centre(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function stickersPosted() {
  const author = await createUser({ tag: "stk" })
  const marker = `${RUN_ID}${randomWord(4)}`
  const tag = `stk${marker.toLowerCase()}`
  const form = await openPhotoWithStickers(author.page, marker)

  await check("emoji, text and hashtag stickers are added from the tray, the photo is posted with all three, and the feed links the hashtag", async () => {
    await addEmoji(author.page, form, "Red heart")
    await addText(author.page, form, "hello there", "Dark")
    await addHashtag(author.page, form, tag)
    await form.getByRole("button", { name: "Sticker: Red heart", exact: true }).waitFor()
    await form.getByRole("button", { name: "Text sticker: hello there", exact: true }).waitFor()
    await form.getByRole("button", { name: `Hashtag sticker: #${tag}`, exact: true }).waitFor()

    const body = `Stickers on this one ${marker}`
    await typeIn(form, body)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /^Posted\./)
    const postId = await postIdByBody(author.handle, body)
    assert.ok(postId, "the post was not saved")
    const set = await stickerSet(postId)
    assert.equal(set.items.length, 3, `expected three stickers, found ${set.items.length}`)
    assert.equal(set.items[0].kind, "emoji")
    assert.equal(set.items[0].code, "2764")
    assert.equal(set.items[1].kind, "text")
    assert.equal(set.items[1].text, "hello there")
    assert.equal(set.items[1].color, "black", "the Dark look is a solid black box, so its colour is black")
    assert.equal(set.items[1].background, "solid")
    assert.equal(set.items[1].font, "sans")
    assert.equal(set.items[2].kind, "hashtag")
    assert.equal(set.items[2].tag, tag)
    assert.ok(Math.abs(set.aspect - 1.6) < 0.01, `the photo's shape was kept as ${set.aspect}`)

    await openHome(author.page)
    const target = await waitForPost(author.page, marker)
    await target.getByRole("img", { name: "Red heart", exact: true }).waitFor()
    await target.getByText("hello there", { exact: true }).waitFor()
    const link = target.getByRole("link", { name: `#${tag}`, exact: true })
    await link.waitFor()
    assert.equal(await link.getAttribute("href"), `/topics/${tag}`, "the hashtag does not link to its topic")
  })
}

async function movedAndBinned() {
  const author = await createUser({ tag: "stq" })
  const marker = `${RUN_ID}${randomWord(4)}`
  const form = await openPhotoWithStickers(author.page, marker)

  await check("a sticker is dragged onto the middle line and snaps to it, is resized from the keyboard, and the one dropped on the bin is gone", async () => {
    await addEmoji(author.page, form, "Sparkles")
    await addEmoji(author.page, form, "Fire")
    const page = author.page
    const photo = await form.locator('img[alt="Selected image"]').boundingBox()
    assert.ok(photo, "the photo has no box")

    // Fire is on top of Sparkles, so it is dragged to the bin first. The bin only appears once a drag has begun.
    const fire = form.getByRole("button", { name: "Sticker: Fire", exact: true })
    const fireFrom = centre(await fire.boundingBox())
    await page.mouse.move(fireFrom.x, fireFrom.y)
    await page.mouse.down()
    await page.mouse.move(fireFrom.x, fireFrom.y + 20, { steps: 4 })
    const bin = await form.locator("[data-sticker-bin]").boundingBox()
    assert.ok(bin, "the bin did not show while a sticker was dragged")
    const binAt = centre(bin)
    await page.mouse.move(binAt.x, binAt.y, { steps: 8 })
    await page.mouse.up()
    await fire.waitFor({ state: "detached" })

    // Sparkles is dragged to just off the photo's middle line. The sticker's centre is within 1.5% of the middle, so it lands on it.
    const sparkles = form.getByRole("button", { name: "Sticker: Sparkles", exact: true })
    const from = centre(await sparkles.boundingBox())
    const to = { x: photo.x + photo.width / 2 + photo.width * 0.003, y: photo.y + photo.height * 0.3 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 8 })
    await page.mouse.up()
    await sparkles.focus()
    await page.keyboard.press("+")

    const body = `Moved stickers ${marker}`
    await typeIn(form, body)
    await acted(page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(page, /^Posted\./)
    const postId = await postIdByBody(author.handle, body)
    assert.ok(postId, "the post was not saved")
    const set = await stickerSet(postId)
    assert.equal(set.items.length, 1, `the sticker dropped on the bin is still kept (${set.items.length} stickers)`)
    assert.equal(set.items[0].code, "2728")
    assert.ok(Math.abs(set.items[0].x - 0.5) < 0.001, `Sparkles snapped to ${set.items[0].x}, not 0.5`)
    assert.ok(Math.abs(set.items[0].size - 0.24) < 0.001, `Sparkles is ${set.items[0].size} wide, not 0.24`)
  })
}

// The sticker controls wrap on a phone. A row that is too wide would scroll the page sideways, so the page is checked for it.
async function stickersOnPhone() {
  const author = await createUser({ tag: "stp", phone: true })
  const marker = `${RUN_ID}${randomWord(4)}`
  const form = await openPhotoWithStickers(author.page, marker)

  await check("the photo's sticker controls and tray fit a phone's width", async () => {
    await addEmoji(author.page, form, "Party popper")
    await form.getByRole("button", { name: "Sticker: Party popper", exact: true }).waitFor()
    const fits = await author.page.evaluate(() => {
      const root = document.documentElement
      return root.scrollWidth <= root.clientWidth
    })
    assert.ok(fits, "the page scrolls sideways with the sticker controls open")
    const box = await form.getByRole("button", { name: "Done", exact: true }).boundingBox()
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390, "the Done control runs off the phone's screen")
  })
}
