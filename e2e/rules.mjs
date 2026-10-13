// Rules that protect people, checked end to end: paid status never changes who sees a post, and an author who hides the
// counts on their posts hides them from everyone else but not from themselves.
import { area, assert, check, guard } from "./lib/harness.mjs"
import { BASE, RUN_ID, TIMEOUT, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { execute } from "./lib/db.mjs"
import { card, likeButton, openHome, openProfile, waitForPost, writePost } from "./lib/posts.mjs"
import { acted, go } from "./lib/ui.mjs"

export async function run() {
  area("rules")
  await guard("paid status and counts", async () => {
    const author = await createUser({ tag: "rau" })
    const paid = await createUser({ tag: "rpa" })
    const reader = await createUser({ tag: "rre" })
    await execute("INSERT INTO follows (follower_id, followee_id, created_at) VALUES ((SELECT id FROM users WHERE handle = ?), (SELECT id FROM users WHERE handle = ?), ?)", reader.handle, paid.handle, Date.now())
    await execute("INSERT INTO follows (follower_id, followee_id, created_at) VALUES ((SELECT id FROM users WHERE handle = ?), (SELECT id FROM users WHERE handle = ?), ?)", reader.handle, author.handle, Date.now())
    await execute(
      "INSERT INTO subscriptions (id, user_id, kind, status, cancel_at_period_end, current_period_end, created_at, updated_at) VALUES (?, (SELECT id FROM users WHERE handle = ?), 'plus', 'active', 0, ?, ?, ?)",
      `rules-plus-${RUN_ID}${randomWord(4)}`,
      paid.handle,
      Date.now() + 86_400_000,
      Date.now(),
      Date.now()
    )
    await execute(
      "INSERT INTO subscriptions (id, user_id, kind, status, cancel_at_period_end, current_period_end, created_at, updated_at) VALUES (?, (SELECT id FROM users WHERE handle = ?), 'verified', 'active', 0, ?, ?, ?)",
      `rules-verified-${RUN_ID}${randomWord(4)}`,
      paid.handle,
      Date.now() + 86_400_000,
      Date.now(),
      Date.now()
    )
    await execute("UPDATE users SET paid_verified = 1 WHERE handle = ?", paid.handle)

    await check("a paid subscriber's post reaches followers the same way as anyone's", async () => {
      const paidText = `Paid reach ${RUN_ID}${randomWord(4)}`
      const plainText = `Plain reach ${RUN_ID}${randomWord(4)}`
      // The author's own posts are checked on their profile. Home's For you feed leaves out the viewer's own posts, so a
      // new post may not be there on a reload; the profile lists it in time order.
      await writePost(paid.page, paidText)
      await openProfile(paid.page, paid.handle)
      await waitForPost(paid.page, paidText)
      await writePost(author.page, plainText)
      await openProfile(author.page, author.handle)
      await waitForPost(author.page, plainText)
      await openHome(reader.page, "following")
      await waitForPost(reader.page, paidText)
      await waitForPost(reader.page, plainText)
    })

    await check("hiding the counts on a post hides them from others, and the author still sees them", async () => {
      const text = `Counts ${RUN_ID}${randomWord(4)}`
      await writePost(author.page, text)
      await openProfile(author.page, author.handle)
      await waitForPost(author.page, text)
      await openHome(reader.page, "following")
      await waitForPost(reader.page, text)
      // The like is saved before the counts are read: wait for the server to answer the click.
      await acted(reader.page, () => likeButton(card(reader.page, text)).click())
      const feedUrl = `${BASE}/api/feed?spec=${encodeURIComponent(JSON.stringify({ kind: "profile", tab: "posts", handle: author.handle }))}`
      const countsFor = async (user) => {
        const response = await user.page.request.get(feedUrl)
        const body = await response.json()
        const item = body.items.find((entry) => entry.post.body === text)
        assert.ok(item, "the post is missing from the profile feed")
        return item.post.likes
      }
      assert.equal(await countsFor(reader), 1, "the reader does not see the like before hiding")
      await go(author.page, "/settings/privacy", author.page.getByRole("heading", { name: "Hide counts on my posts" }))
      await author.page.getByRole("switch", { name: "Hide counts on my posts" }).click()
      await author.page.getByText("Counts on your posts are hidden from everyone else.").waitFor({ timeout: TIMEOUT })
      assert.equal(await countsFor(reader), 0, "the reader still sees the hidden like count")
      assert.equal(await countsFor(author), 1, "the author lost the count on their own post")
    })
  })
}
