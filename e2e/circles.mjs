// Circles: groups inside Rhenko, each with its own charter. An open circle is joined with one press. An ask-to-join circle
// keeps the applicant's answer for the owner to read. An invite-only circle is shown to its members alone: its posts, its
// charter and its replies stay out of every feed, search and direct link for anyone else.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { postIdByBody, query } from "./lib/db.mjs"
import { COMPOSER_TEXT, homeComposer, noPost, openHome, openProfile, openSearch, typeIn, waitForPost } from "./lib/posts.mjs"
import { acted, go, notHere, toastText } from "./lib/ui.mjs"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

const circleUrl = (slug) => `/circles/${slug}`

// Escapes text for a regular expression, for matching toasts that carry a circle's name.
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function run() {
  area("circles")
  await guard("an open circle: start it, join it, post in it, leave it, and deleting it keeps its posts", openCircle)
  await guard("an ask-to-join circle: the applicant answers, and the owner decides", askCircle)
  await guard(
    "an invite-only circle: only its members see its posts, replies and charter, and deleting it takes them",
    closedCircle
  )
}

// Fills the start form and returns the address the circle was given.
async function startCircle(page, { name, tagline = "", charter = "", access = "open", question = "" }) {
  await go(page, "/circles/new", page.locator("input[name=name]"))
  await page.locator("input[name=name]").fill(name)
  await page.locator("input[name=tagline]").fill(tagline)
  if (access !== "open") await page.locator(`input[name=access][value=${access}]`).check()
  if (question) await page.locator("input[name=joinQuestion]").fill(question)
  await page.locator("textarea[name=charter]").fill(charter)
  await acted(page, () => page.getByRole("button", { name: "Start circle", exact: true }).click())
  await page.waitForURL((url) => /^\/circles\/[^/]+$/.test(url.pathname) && url.pathname !== "/circles/new")
  return new URL(page.url()).pathname.split("/").pop()
}

async function openCircle() {
  const owner = await createUser({ tag: "cco" })
  const joiner = await createUser({ tag: "ccj" })
  const stranger = await createUser({ tag: "ccs" })
  const name = uniq("Late bakers")
  const charter = uniq("Be kind. Recipes go in the recipe thread.")
  const slug = await startCircle(owner.page, { name, tagline: "Bread, pastry and burnt edges", charter })

  await check("the new circle shows its name, tagline, charter and owner, and its owner can post in it", async () => {
    await go(owner.page, circleUrl(slug), owner.page.getByRole("heading", { name }))
    assert.ok((await owner.page.getByText(charter).count()) > 0, "the charter is not shown")
    assert.ok((await owner.page.getByText(`Run by @${owner.handle}`).count()) > 0, "the owner is not named")
    assert.equal(await owner.page.locator(COMPOSER_TEXT).count(), 1, "the owner has no composer in their circle")
  })

  await check("an open circle is joined with one press, and shows in the joiner's circles", async () => {
    await go(joiner.page, circleUrl(slug), joiner.page.getByRole("button", { name: "Join circle", exact: true }))
    await acted(joiner.page, () => joiner.page.getByRole("button", { name: "Join circle", exact: true }).click())
    await toastText(joiner.page, new RegExp(`^You joined ${escapeRegExp(name)}`))
    await joiner.page.getByRole("button", { name: "Leave circle", exact: true }).waitFor()
    await go(joiner.page, "/circles", joiner.page.getByRole("heading", { name: "Your circles" }))
    assert.ok((await joiner.page.getByRole("link", { name }).count()) > 0, "the joined circle is not in Your circles")
  })

  const text = uniq("Sourdough starter, day three")
  await check("a member's post in the circle shows in its feed, labelled with the circle", async () => {
    await go(joiner.page, circleUrl(slug), homeComposer(joiner.page).locator(COMPOSER_TEXT))
    await typeIn(homeComposer(joiner.page), text)
    await acted(joiner.page, () => homeComposer(joiner.page).getByRole("button", { name: "Post", exact: true }).click())
    await toastText(joiner.page, /^Posted\./)
    const card = await waitForPost(joiner.page, text, { reload: true })
    assert.ok((await card.getByRole("link", { name }).count()) > 0, "the post is not labelled with its circle")
  })

  const fromHome = uniq("Posted from Home into the circle")
  await check("the Home composer posts into a circle the reader is in, when Post in names it", async () => {
    await go(joiner.page, "/", homeComposer(joiner.page).locator(COMPOSER_TEXT))
    const picker = homeComposer(joiner.page).getByLabel("Post in")
    await picker.selectOption({ label: name })
    await typeIn(homeComposer(joiner.page), fromHome)
    await acted(joiner.page, () => homeComposer(joiner.page).getByRole("button", { name: "Post", exact: true }).click())
    await toastText(joiner.page, /^Posted\./)
    const rows = await query(
      "SELECT c.slug AS slug FROM posts p JOIN communities c ON c.id = p.community_id WHERE p.body = ?",
      fromHome
    )
    assert.equal(rows[0]?.slug, slug, "the post from Home did not go into the chosen circle")
  })

  await check("an open circle's posts are public: a stranger reads them on the circle and on the writer's profile", async () => {
    await go(stranger.page, circleUrl(slug), stranger.page.getByRole("button", { name: "Join circle", exact: true }))
    await waitForPost(stranger.page, text)
    // The profile is the public place a post is always read from. For You is ranked across the site and shows only its first
    // page, so a fresh post is not promised there.
    await openProfile(stranger.page, joiner.handle)
    await waitForPost(stranger.page, text)
  })

  await check("leaving an open circle takes the composer away again", async () => {
    await go(joiner.page, circleUrl(slug), joiner.page.getByRole("button", { name: "Leave circle", exact: true }))
    await acted(joiner.page, () => joiner.page.getByRole("button", { name: "Leave circle", exact: true }).click())
    await joiner.page.getByRole("button", { name: "Join circle", exact: true }).waitFor()
    assert.equal(await joiner.page.locator(COMPOSER_TEXT).count(), 0, "a non-member still has a composer in the circle")
  })

  await check("deleting an open circle keeps its posts on the site as ordinary posts", async () => {
    await go(
      owner.page,
      `${circleUrl(slug)}?tab=settings`,
      owner.page.getByRole("button", { name: "Delete circle", exact: true })
    )
    await owner.page.getByRole("button", { name: "Delete circle", exact: true }).click()
    await owner.page.getByRole("dialog").getByRole("button", { name: "Delete circle", exact: true }).click()
    await toastText(owner.page, /^Circle deleted/)
    const rows = await query("SELECT community_id FROM posts WHERE body = ?", text)
    assert.equal(rows.length, 1, "the open circle's post was deleted with it")
    assert.equal(rows[0].community_id, null, "the open circle's post still names the deleted circle")
    // The post is public, so it stays on its writer's profile for anyone, now without the circle's label. The writer is the
    // joiner, whom the owner does not follow, so a stranger reads it there.
    await openProfile(stranger.page, joiner.handle)
    const card = await waitForPost(stranger.page, text, { reload: true })
    assert.equal(await card.getByRole("link", { name }).count(), 0, "the post still carries the deleted circle's label")
  })
}

async function askCircle() {
  const owner = await createUser({ tag: "cao" })
  const applicant = await createUser({ tag: "caa" })
  const name = uniq("Sunday runners")
  const question = "Which pace do you run?"
  const slug = await startCircle(owner.page, { name, access: "request", question })
  const answer = uniq("Around six minutes a mile, most weeks")

  await check("an ask-to-join circle takes an answer, and the applicant waits for the owner", async () => {
    await go(applicant.page, circleUrl(slug), applicant.page.getByRole("button", { name: "Ask to join", exact: true }))
    await applicant.page.getByRole("button", { name: "Ask to join", exact: true }).click()
    await applicant.page.getByText(question).waitFor()
    await applicant.page.locator("textarea[name=answer]").fill(answer)
    await acted(applicant.page, () => applicant.page.getByRole("button", { name: "Send request", exact: true }).click())
    await toastText(applicant.page, /^Request sent/)
    await applicant.page.getByText("Request sent. Waiting for the owner.").waitFor()
    assert.equal(await applicant.page.locator(COMPOSER_TEXT).count(), 0, "an applicant has a composer before they are in")
  })

  await check("the owner reads the answer under Asking to join, and approves the applicant", async () => {
    await go(owner.page, `${circleUrl(slug)}?tab=settings`, owner.page.getByRole("heading", { name: "Asking to join" }))
    assert.ok((await owner.page.getByText(answer).count()) > 0, "the answer is not shown to the owner")
    await acted(owner.page, () => owner.page.getByRole("button", { name: "Approve", exact: true }).click())
    await toastText(owner.page, new RegExp(`^@${applicant.handle} is in`))
  })

  await check("the approved applicant is a member: they have a composer, and the request list is empty", async () => {
    await go(applicant.page, circleUrl(slug), applicant.page.getByRole("button", { name: "Leave circle", exact: true }))
    assert.equal(await applicant.page.locator(COMPOSER_TEXT).count(), 1, "the approved applicant has no composer")
    await go(owner.page, `${circleUrl(slug)}?tab=settings`, owner.page.getByRole("heading", { name: "Asking to join" }))
    await owner.page.getByText("No one is waiting.").waitFor()
  })
}

async function closedCircle() {
  const owner = await createUser({ tag: "ccl" })
  const member = await createUser({ tag: "ccm" })
  const outsider = await createUser({ tag: "cco2" })
  const name = uniq("Private kitchen")
  const charter = uniq("Members only charter")
  const slug = await startCircle(owner.page, { name, access: "closed", charter })
  const secret = uniq("Our private menu for the week")

  await check("an invite-only circle's owner posts in it, and sees the post", async () => {
    await go(owner.page, circleUrl(slug), homeComposer(owner.page).locator(COMPOSER_TEXT))
    await typeIn(homeComposer(owner.page), secret)
    await acted(owner.page, () => homeComposer(owner.page).getByRole("button", { name: "Post", exact: true }).click())
    await toastText(owner.page, /^Posted\./)
    await waitForPost(owner.page, secret, { reload: true })
  })

  await check("a stranger sees the invite-only circle's name, not its posts, charter or a way in", async () => {
    await go(outsider.page, circleUrl(slug))
    await outsider.page.getByText("This circle is invite-only").waitFor()
    assert.equal(await outsider.page.getByText(charter).count(), 0, "the charter of a closed circle is shown to a stranger")
    assert.equal(
      await outsider.page.getByRole("button", { name: "Join circle", exact: true }).count(),
      0,
      "a closed circle has a join button"
    )
    assert.equal(
      await outsider.page.getByRole("button", { name: "Ask to join", exact: true }).count(),
      0,
      "a closed circle asks to join"
    )
    assert.equal(await outsider.page.getByText(secret).count(), 0, "a closed circle's post shows on its page to a stranger")
  })

  await check("a closed circle's post is hidden from a stranger's For you, search and direct link", async () => {
    const postId = need(await postIdByBody(owner.handle, secret), "the closed post's id")
    await openHome(outsider.page)
    assert.equal(await noPost(outsider.page, secret, 2500), true, "the closed post is on a stranger's For you")
    await openSearch(outsider.page, secret)
    assert.equal(await noPost(outsider.page, secret, 2500), true, "the closed post is in a stranger's search")
    await notHere(outsider.page, `/${owner.handle}/status/${postId}`)
    // a stranger opened a closed circle's post by its link
  })

  await check("the owner adds a member by handle, and the member reads the circle's posts and charter", async () => {
    await go(owner.page, `${circleUrl(slug)}?tab=members`, owner.page.getByRole("button", { name: "Add", exact: true }))
    await owner.page.getByLabel("Handle").fill(member.handle)
    await acted(owner.page, () => owner.page.getByRole("button", { name: "Add", exact: true }).click())
    await toastText(owner.page, new RegExp(`^Added @${member.handle}`))
    await go(member.page, circleUrl(slug), member.page.getByRole("button", { name: "Leave circle", exact: true }))
    await waitForPost(member.page, secret, { reload: true })
    assert.ok((await member.page.getByText(charter).count()) > 0, "the member does not see the charter")
  })

  const reply = uniq("Reply from inside the circle")
  await check("a member's reply to a closed post stays in the circle, out of a stranger's view", async () => {
    const postId = need(await postIdByBody(owner.handle, secret), "the closed post's id")
    await go(member.page, `/${owner.handle}/status/${postId}`, member.page.locator("form#reply"))
    await member.page.locator("form#reply").locator(COMPOSER_TEXT).fill(reply)
    await acted(member.page, () => member.page.locator("form#reply").getByRole("button", { name: "Reply", exact: true }).click())
    await toastText(member.page, /^Reply posted/)
    const replyId = need(await postIdByBody(member.handle, reply), "the reply's id")
    const rows = await query("SELECT community_id FROM posts WHERE id = ?", replyId)
    assert.ok(rows[0]?.community_id, "the reply did not stay in the circle it answers")
    await notHere(outsider.page, `/${member.handle}/status/${replyId}`)
    // a stranger opened a closed circle's reply by its link
  })

  await check("a removed member loses the circle's posts, and the owner keeps the post they wrote", async () => {
    await go(owner.page, `${circleUrl(slug)}?tab=members`, owner.page.getByRole("button", { name: `Remove @${member.handle}` }))
    await owner.page.getByRole("button", { name: `Remove @${member.handle}` }).click()
    await owner.page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click()
    await toastText(owner.page, new RegExp(`^Removed @${member.handle}`))
    await go(member.page, circleUrl(slug), member.page.getByText("This circle is invite-only"))
    assert.equal(await member.page.getByText(secret).count(), 0, "a removed member still sees the circle's posts")
    // The owner's view is the circle's posts again: a reload would keep the Members tab that the removal was made on.
    await go(owner.page, circleUrl(slug), homeComposer(owner.page).locator(COMPOSER_TEXT))
    await waitForPost(owner.page, secret)
  })

  await check("deleting an invite-only circle deletes its posts and their replies with them", async () => {
    await go(
      owner.page,
      `${circleUrl(slug)}?tab=settings`,
      owner.page.getByRole("button", { name: "Delete circle", exact: true })
    )
    await owner.page.getByRole("button", { name: "Delete circle", exact: true }).click()
    await owner.page.getByRole("dialog").getByRole("button", { name: "Delete circle", exact: true }).click()
    await toastText(owner.page, /^Circle deleted/)
    const post = await query("SELECT COUNT(*) AS n FROM posts WHERE body = ?", secret)
    assert.equal(post[0].n, 0, "the invite-only circle's post was not deleted with it")
    const left = await query("SELECT COUNT(*) AS n FROM posts WHERE body = ?", reply)
    assert.equal(left[0].n, 0, "the invite-only circle's reply was not deleted with it")
    await notHere(owner.page, circleUrl(slug))
  })
}
