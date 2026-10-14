// Stickers on a photo: emoji and short text, placed in the composer, kept with the photo when it is posted, and drawn over the
// photo in the feed. They can be moved, resized and removed from the keyboard, so the controls work without a mouse.
import { area, assert, check, guard } from "./lib/harness.mjs"
import { RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { postIdByBody, query } from "./lib/db.mjs"
import { makePng } from "./lib/files.mjs"
import { attach, homeComposer, openHome, typeIn, waitForPost } from "./lib/posts.mjs"
import { acted, toastText } from "./lib/ui.mjs"

// A sticker placed by the tray lands a little left of the middle the first time, so the keyboard checks start from there.
const FIRST_X = 0.38

export async function run() {
  area("stickers")
  await guard("a photo gets emoji and text stickers in the composer, and they are kept with it when it is posted", stickersPosted)
  await guard("a sticker can be moved, resized and removed from the keyboard before the photo is posted", keyboardEditing)
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

async function addEmoji(page, form, name) {
  await form.getByRole("button", { name: "Add a sticker", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Add a sticker" })
  await dialog.waitFor()
  await dialog.getByRole("button", { name: `Add ${name}`, exact: true }).click()
  await dialog.waitFor({ state: "detached" })
}

async function stickerSet(postId) {
  const rows = await query("SELECT stickers FROM post_media WHERE post_id = ? AND stickers IS NOT NULL", postId)
  assert.equal(rows.length, 1, "the photo's stickers were not kept")
  return JSON.parse(rows[0].stickers)
}

async function stickersPosted() {
  const author = await createUser({ tag: "stk" })
  const marker = `${RUN_ID}${randomWord(4)}`
  const form = await openPhotoWithStickers(author.page, marker)

  await check("an emoji sticker and a text sticker are added from the tray, and both show in the composer", async () => {
    await addEmoji(author.page, form, "Red heart")
    await form.getByRole("button", { name: "Add a sticker", exact: true }).click()
    const dialog = author.page.getByRole("dialog", { name: "Add a sticker" })
    await dialog.waitFor()
    await dialog.getByLabel("Text sticker", { exact: true }).fill("hello there")
    await dialog.getByRole("button", { name: "Dark", exact: true }).click()
    await dialog.getByRole("button", { name: "Add text", exact: true }).click()
    await dialog.waitFor({ state: "detached" })
    await form.getByRole("button", { name: "Sticker: Red heart", exact: true }).waitFor()
    await form.getByRole("button", { name: "Text sticker: hello there", exact: true }).waitFor()
  })

  await check("the photo is posted with both stickers, and the feed draws them over it", async () => {
    const body = `Stickers on this one ${marker}`
    await typeIn(form, body)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /^Posted\./)
    const postId = await postIdByBody(author.handle, body)
    assert.ok(postId, "the post was not saved")
    const set = await stickerSet(postId)
    assert.equal(set.items.length, 2, `expected two stickers, found ${set.items.length}`)
    assert.equal(set.items[0].kind, "emoji")
    assert.equal(set.items[0].code, "2764")
    assert.equal(set.items[1].kind, "text")
    assert.equal(set.items[1].text, "hello there")
    assert.equal(set.items[1].style, "dark")
    assert.ok(Math.abs(set.aspect - 1.6) < 0.01, `the photo's shape was kept as ${set.aspect}`)

    await openHome(author.page)
    const target = await waitForPost(author.page, marker)
    await target.getByRole("img", { name: "Red heart", exact: true }).waitFor()
    await target.getByText("hello there", { exact: true }).waitFor()
  })
}

async function keyboardEditing() {
  const author = await createUser({ tag: "stq" })
  const marker = `${RUN_ID}${randomWord(4)}`
  const form = await openPhotoWithStickers(author.page, marker)

  await check("stickers are moved, resized and removed with the keyboard, and the result is what is posted", async () => {
    await addEmoji(author.page, form, "Sparkles")
    await addEmoji(author.page, form, "Fire")

    const sparkles = form.getByRole("button", { name: "Sticker: Sparkles", exact: true })
    await sparkles.focus()
    await author.page.keyboard.press("ArrowRight")
    await author.page.keyboard.press("ArrowRight")
    await author.page.keyboard.press("ArrowRight")
    await author.page.keyboard.press("+")

    const fire = form.getByRole("button", { name: "Sticker: Fire", exact: true })
    await fire.focus()
    await author.page.keyboard.press("Delete")
    await fire.waitFor({ state: "detached" })

    const body = `Keyboard stickers ${marker}`
    await typeIn(form, body)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /^Posted\./)
    const postId = await postIdByBody(author.handle, body)
    assert.ok(postId, "the post was not saved")
    const set = await stickerSet(postId)
    assert.equal(set.items.length, 1, `the removed sticker is still kept (${set.items.length} stickers)`)
    assert.equal(set.items[0].code, "2728")
    assert.ok(Math.abs(set.items[0].x - (FIRST_X + 0.03)) < 0.001, `Sparkles moved to ${set.items[0].x}, not ${FIRST_X + 0.03}`)
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
