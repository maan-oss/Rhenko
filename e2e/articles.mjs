// Articles: a post with a title and a longer body than an ordinary post. The title shows in the feed and on the post's own page,
// and it can be changed while the post can still be edited. An article can't be a poll, a thread, a reply or a quote.
import { area, assert, check, guard } from "./lib/harness.mjs"
import { RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { query } from "./lib/db.mjs"
import { cardMenu, cardPostId, homeComposer, openHome, typeIn, waitForPost } from "./lib/posts.mjs"
import { acted, go, toastText } from "./lib/ui.mjs"

// Longer than an ordinary post can be (25,000 characters) and well inside the article limit.
const LONG_BODY_FILLER = "Still going, one more paragraph. ".repeat(900)

export async function run() {
  area("articles")
  await guard("an article: a title and a body longer than a post, shown in the feed and on its page", articleBasics)
  await guard("an article's title is checked, and the article's extra options stay off", articleRules)
}

async function articleBasics() {
  const author = await createUser({ tag: "art" })
  const marker = `${RUN_ID}${randomWord(4)}`
  const title = `Notes on ${marker}`
  const body = `Opening line ${marker}. ${LONG_BODY_FILLER}`
  const retitled = `Notes, revised ${marker}`

  await check("an article is posted with a title and a body longer than a post", async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await form.getByRole("button", { name: "Write an article", exact: true }).click()
    await form.getByLabel("Article title").fill(title)
    await typeIn(form, body)
    await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
    await toastText(author.page, /^Posted\./)
    const rows = await query("SELECT title, LENGTH(body) AS size FROM posts WHERE title = ?", title)
    assert.equal(rows.length, 1, "the article was not saved with its title")
    assert.ok(rows[0].size > 25000, `the article body is only ${rows[0].size} characters, so it did not test the longer limit`)
  })

  await check("the title heads the article in the feed", async () => {
    await openHome(author.page)
    const target = await waitForPost(author.page, marker)
    await target.getByRole("heading", { name: title, exact: true }).waitFor()
  })

  await check("the article's own page shows the title as its heading", async () => {
    await openHome(author.page)
    const target = await waitForPost(author.page, marker)
    const id = await cardPostId(target)
    await go(author.page, `/${author.handle}/status/${id}`, author.page.getByRole("heading", { name: title, exact: true }))
    assert.ok((await author.page.getByText(`Opening line ${marker}.`).count()) > 0, "the opening of the body is not shown")
  })

  await check("the title can be changed from the post's menu, and the change is marked as an edit", async () => {
    await openHome(author.page)
    const target = await waitForPost(author.page, marker)
    await cardMenu(author.page, target, "Edit post")
    const dialog = author.page.getByRole("dialog", { name: "Edit post" })
    await dialog.waitFor()
    await dialog.getByLabel("Title").fill(retitled)
    await acted(author.page, () => dialog.getByRole("button", { name: "Save", exact: true }).click())
    await toastText(author.page, /Post updated/)
    const updated = await waitForPost(author.page, marker)
    await updated.getByRole("heading", { name: retitled, exact: true }).waitFor()
    const rows = await query("SELECT title, edited_at FROM posts WHERE title = ?", retitled)
    assert.equal(rows.length, 1, "the new title was not saved")
    assert.ok(rows[0].edited_at !== null, "a changed title was not marked as an edit")
  })
}

async function articleRules() {
  const author = await createUser({ tag: "arr" })

  await check("a title longer than 120 characters keeps the post button off", async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await form.getByRole("button", { name: "Write an article", exact: true }).click()
    await form.getByLabel("Article title").fill("x".repeat(130))
    await typeIn(form, "A short article.")
    assert.ok(await form.getByRole("button", { name: "Post", exact: true }).isDisabled(), "a 130 character title could be posted")
  })

  await check("an article without a title can't be posted", async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await form.getByRole("button", { name: "Write an article", exact: true }).click()
    await typeIn(form, "Still no title.")
    assert.ok(await form.getByRole("button", { name: "Post", exact: true }).isDisabled(), "an article without a title could be posted")
  })

  await check("an article can't carry a poll or a thread", async () => {
    await openHome(author.page)
    const form = homeComposer(author.page)
    await form.getByRole("button", { name: "Write an article", exact: true }).click()
    assert.ok(await form.getByRole("button", { name: "Add a poll" }).isDisabled(), "the poll button is still on for an article")
    assert.ok(await form.getByRole("button", { name: "Add to thread" }).isDisabled(), "the thread button is still on for an article")
  })
}
