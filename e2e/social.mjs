// People and discovery: follow, protected accounts and follow requests, mute, block, muted words, lists, search with
// operators, Explore and topics. The flows that differ by screen run on a computer and on a phone.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { RUN_ID, randomWord, sleep } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { makePng } from "./lib/files.mjs"
import { expectBanner, idleOnSettings } from "./lib/live.mjs"
import {
  addMutedWord,
  block,
  follow,
  followButton,
  mute,
  noticeRow,
  openNotifications,
  openPrivacy,
  removeMutedWord,
  requestsBox,
  setProtected,
  unfollowButton,
  withdrawButton,
} from "./lib/people.mjs"
import { attach, card, cardCount, homeComposer, likeButton, noPost, openHome, openProfile, openSearch, replyButton, typeIn, waitForPost, writePost } from "./lib/posts.mjs"
import { acted, alertText, bodyText, gone, go, missingHandle, missingId, notHere, ready, toastText } from "./lib/ui.mjs"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

export async function run() {
  area("social")
  for (const phone of [false, true]) {
    const where = phone ? "a phone" : "a computer"
    await guard(`follow and unfollow on ${where}`, () => followFlow({ phone }))
    await guard(`protected account and follow requests on ${where}`, () => protectedFlow({ phone }))
    await guard(`lists on ${where}`, () => listsFlow({ phone }))
    await guard(`topics on ${where}`, () => topicsFlow({ phone }))
  }
  await guard("mute and block", muteAndBlockFlow)
  await guard("muted words", mutedWordsFlow)
  await guard("search with operators", searchFlow)
  await guard("explore", exploreFlow)
}

// ---------------------------------------------------------------------------------------------------------------------
// Follow
// ---------------------------------------------------------------------------------------------------------------------

async function followFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const fan = await createUser({ tag: phone ? "fnp" : "fnd", phone })
  const star = await createUser({ tag: phone ? "srp" : "srd", phone })
  const starPost = uniq("Post from the followed account")
  await writePost(star.page, starPost)

  await check(`${where}: Follow changes the button, tells the other person at once, and holds after a reload`, async () => {
    await idleOnSettings(star.page)
    const banner = expectBanner(star.page, "followed you")
    await openProfile(fan.page, star.handle)
    await acted(fan.page, () => followButton(fan.page, star.handle).click())
    await toastText(fan.page, new RegExp(`^You follow @${star.handle}`, "i"))
    await unfollowButton(fan.page, star.handle).waitFor()
    assert.equal(await banner, true, "the followed person got no banner on a page that is not a feed")
    await fan.page.reload()
    await unfollowButton(fan.page, star.handle).waitFor()
  })

  await check(`${where}: the Followers and Following pages list each other`, async () => {
    await go(star.page, `/${star.handle}/followers`, star.page.locator("main ul").first())
    await star.page.getByRole("link", { name: `${fan.name}'s profile` }).first().waitFor()
    await go(fan.page, `/${fan.handle}/following`, fan.page.locator("main ul").first())
    await fan.page.getByRole("link", { name: `${star.name}'s profile` }).first().waitFor()
    await unfollowButton(fan.page, star.handle).waitFor()
  })

  await check(`${where}: the Following feed shows the followed person's post`, async () => {
    await openHome(fan.page, "following")
    await waitForPost(fan.page, starPost)
  })

  await check(`${where}: a new post from someone you follow shows a pill on Following, and the pill loads it`, async () => {
    await openHome(fan.page, "following")
    const freshPost = uniq("A new post from the followed account")
    await writePost(star.page, freshPost)
    const pill = fan.page.getByRole("button", { name: "1 new post", exact: true })
    await pill.waitFor()
    // The pill is a notice: the new post is not in the list until the reader asks for it.
    assert.equal(await noPost(fan.page, freshPost, 0), true, "the new post was in the list before the pill was pressed")
    await pill.click()
    await waitForPost(fan.page, freshPost)
    await pill.waitFor({ state: "detached" })
    await waitForPost(fan.page, starPost)
  })

  await check(`${where}: the notifications page lists the new follower`, async () => {
    await openNotifications(star.page)
    await noticeRow(star.page, { name: fan.name, text: "followed you" }).waitFor()
  })

  await check(`${where}: following back shows "Follows you" on the other profile`, async () => {
    await follow(star.page, fan.handle)
    await openProfile(fan.page, star.handle)
    await fan.page.getByText("Follows you", { exact: true }).waitFor()
  })

  await check(`${where}: Unfollow takes the post out of the Following feed`, async () => {
    await acted(fan.page, () => unfollowButton(fan.page, star.handle).click())
    await toastText(fan.page, new RegExp(`^You unfollowed @${star.handle}`, "i"))
    await followButton(fan.page, star.handle).waitFor()
    await openHome(fan.page, "following")
    assert.equal(await noPost(fan.page, starPost), true, "the post of an unfollowed account is still in the Following feed")
  })

  await check(`${where}: a post from an account you do not follow shows no pill`, async () => {
    await openHome(fan.page, "following")
    await writePost(star.page, uniq("A post after the unfollow"))
    await sleep(2500)
    assert.equal(await fan.page.getByRole("button", { name: /new posts?$/ }).count(), 0, "a pill showed for an account that is not followed")
  })

  await check(`${where}: Remove on your own Followers page ends that follow`, async () => {
    await follow(fan.page, star.handle)
    await go(star.page, `/${star.handle}/followers`, star.page.locator("main ul").first())
    const remove = star.page.getByRole("button", { name: `Remove @${fan.handle} from your followers` })
    await acted(star.page, () => remove.click())
    await toastText(star.page, new RegExp(`^@${fan.handle} no longer follows you`, "i"))
    await remove.waitFor({ state: "detached" })
    await openProfile(fan.page, star.handle)
    await followButton(fan.page, star.handle).waitFor()
  })

  await check(`${where}: resting on a name shows the person's card, and Follow works from it`, async () => {
    await openProfile(fan.page, star.handle)
    const nameLink = card(fan.page, starPost).getByRole("link", { name: star.name, exact: true })
    const popup = fan.page.locator(`[aria-label="@${star.handle} profile preview"]`)
    await nameLink.hover()
    // A phone has no hover, so the name is only a link and no card opens.
    if (phone) {
      await sleep(1200)
      assert.equal(await popup.count(), 0, "a phone showed a hover card")
      return
    }
    await popup.waitFor()
    await popup.getByText(star.name, { exact: true }).waitFor()
    await acted(fan.page, () => popup.getByRole("button", { name: `Follow @${star.handle}`, exact: true }).click())
    await toastText(fan.page, new RegExp(`^You follow @${star.handle}`, "i"))
    await popup.getByRole("button", { name: `Unfollow @${star.handle}`, exact: true }).waitFor()
    await fan.page.mouse.move(0, 0)
    await popup.waitFor({ state: "detached" })
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Protected account
// ---------------------------------------------------------------------------------------------------------------------

async function protectedFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const owner = await createUser({ tag: phone ? "pwp" : "pwd", phone })
  const asker = await createUser({ tag: phone ? "akp" : "akd", phone })
  const newcomer = await createUser({ tag: phone ? "ncp" : "ncd", phone })
  const secret = uniq("Protected post")
  await writePost(owner.page, secret)

  await check(`${where}: switching on Protect your posts says so and stays on after a reload`, async () => {
    const message = await setProtected(owner.page, true)
    assert.match(message ?? "", /New followers need your approval/)
    await owner.page.reload()
    await owner.page.getByRole("switch", { name: "Protect my posts" }).waitFor()
    assert.equal(await owner.page.getByRole("switch", { name: "Protect my posts" }).getAttribute("aria-checked"), "true")
    await openProfile(owner.page, owner.handle)
    await owner.page.getByRole("img", { name: "Protected account" }).first().waitFor()
  })

  await check(`${where}: a stranger sees the lock notice and none of the posts`, async () => {
    await openProfile(asker.page, owner.handle)
    await asker.page.getByText("This account is protected").waitFor()
    await asker.page.getByRole("img", { name: "Protected account" }).first().waitFor()
    assert.equal(await noPost(asker.page, secret, 1200), true, "a protected account's post is shown to someone who does not follow it")
  })

  await check(`${where}: Follow on a protected profile sends a request, the owner is told at once, and the request can be withdrawn`, async () => {
    await idleOnSettings(owner.page)
    const banner = expectBanner(owner.page, "asked to follow you")
    await openProfile(asker.page, owner.handle)
    await acted(asker.page, () => followButton(asker.page, owner.handle).click())
    await toastText(asker.page, /^Request sent to @/)
    await withdrawButton(asker.page, owner.handle).waitFor()
    await asker.page.getByText(/Your follow request is pending/).waitFor()
    assert.equal(await banner, true, "the owner got no banner for the follow request")
    await openNotifications(owner.page)
    await requestsBox(owner.page).getByText(`@${asker.handle} wants to follow you`).waitFor()

    await openProfile(asker.page, owner.handle)
    await acted(asker.page, () => withdrawButton(asker.page, owner.handle).click())
    await toastText(asker.page, /^Request to @.* withdrawn/)
    await followButton(asker.page, owner.handle).waitFor()
    await openNotifications(owner.page)
    assert.equal(await requestsBox(owner.page).count(), 0, "a withdrawn request is still listed under Follow requests")
  })

  await check(`${where}: Decline clears the request and the posts stay hidden`, async () => {
    await openProfile(asker.page, owner.handle)
    await acted(asker.page, () => followButton(asker.page, owner.handle).click())
    await withdrawButton(asker.page, owner.handle).waitFor()
    await openNotifications(owner.page)
    const box = requestsBox(owner.page)
    await box.getByText(`@${asker.handle} wants to follow you`).waitFor()
    await acted(owner.page, () => box.getByRole("button", { name: `Decline the request from @${asker.handle}` }).click())
    await toastText(owner.page, /^Declined the request from @/)
    await box.getByText(`@${asker.handle} wants to follow you`).waitFor({ state: "detached" })
    await openProfile(asker.page, owner.handle)
    await followButton(asker.page, owner.handle).waitFor()
    assert.equal(await noPost(asker.page, secret, 1000), true, "a declined requester can see the protected posts")
  })

  await check(`${where}: Accept lets the person in: posts show, the Following feed has them, the Followers page lists them`, async () => {
    await openProfile(asker.page, owner.handle)
    await acted(asker.page, () => followButton(asker.page, owner.handle).click())
    await withdrawButton(asker.page, owner.handle).waitFor()
    await openNotifications(owner.page)
    const box = requestsBox(owner.page)
    await box.getByText(`@${asker.handle} wants to follow you`).waitFor()
    await acted(owner.page, () => box.getByRole("button", { name: `Accept the request from @${asker.handle}` }).click())
    await toastText(owner.page, new RegExp(`^@${asker.handle} follows you now`, "i"))
    await openProfile(asker.page, owner.handle)
    await unfollowButton(asker.page, owner.handle).waitFor()
    await waitForPost(asker.page, secret)
    await openHome(asker.page, "following")
    await waitForPost(asker.page, secret)
    await go(owner.page, `/${owner.handle}/followers`, owner.page.locator("main ul").first())
    await owner.page.getByRole("link", { name: `${asker.name}'s profile` }).first().waitFor()
  })

  await check(`${where}: a protected account hides who follows it from strangers, and turning protection off clears pending requests`, async () => {
    await openProfile(newcomer.page, owner.handle)
    await acted(newcomer.page, () => followButton(newcomer.page, owner.handle).click())
    await withdrawButton(newcomer.page, owner.handle).waitFor()
    await go(newcomer.page, `/${owner.handle}/followers`, newcomer.page.getByText("This account is protected"))
    const message = await setProtected(owner.page, false)
    assert.match(message ?? "", /1 pending follow request cleared/, "turning protection off did not say that the request was cleared")
    await openProfile(newcomer.page, owner.handle)
    await followButton(newcomer.page, owner.handle).waitFor()
    await waitForPost(newcomer.page, secret)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Mute and block
// ---------------------------------------------------------------------------------------------------------------------

function privacyRow(page, handle) {
  return page.locator("main li").filter({ hasText: `@${handle}` }).first()
}

async function muteAndBlockFlow() {
  const me = await createUser({ tag: "mbm" })
  const them = await createUser({ tag: "mbt" })
  const theirPost = uniq("Post from the other account")
  const myPost = uniq("My own post")
  await follow(me.page, them.handle)
  await follow(them.page, me.handle)
  await writePost(them.page, theirPost)
  await writePost(me.page, myPost)

  await check("mute: Mute on a profile takes the person's posts out of the feeds and the menu then offers Unmute", async () => {
    await openHome(me.page, "following")
    await waitForPost(me.page, theirPost)
    await mute(me.page, them.handle)
    await me.page.locator("main").getByRole("button", { name: "More options" }).first().click()
    await me.page.getByRole("menuitem", { name: `Unmute @${them.handle}` }).waitFor()
    await me.page.keyboard.press("Escape")
    await openHome(me.page, "following")
    assert.equal(await noPost(me.page, theirPost), true, "a muted account's post is still in the Following feed")
    await openProfile(them.page, me.handle)
    await waitForPost(them.page, myPost)
  })

  await check("mute: a muted account's like does not notify the person who muted it", async () => {
    await openProfile(them.page, me.handle)
    const target = await waitForPost(them.page, myPost)
    await acted(them.page, () => likeButton(target).click())
    await target.getByRole("button", { name: /^Unlike, 1 like$/ }).waitFor()
    await openNotifications(me.page)
    assert.equal(await noticeRow(me.page, { name: them.name, text: "liked your post" }).count(), 0, "a muted account's like produced a notification")
  })

  await check("mute: Privacy and safety lists the muted account, and Unmute brings the posts back", async () => {
    await openPrivacy(me.page)
    const row = privacyRow(me.page, them.handle)
    await row.waitFor()
    await acted(me.page, () => row.getByRole("button", { name: "Unmute", exact: true }).click())
    await toastText(me.page, /^Unmuted @/)
    await openHome(me.page, "following")
    await waitForPost(me.page, theirPost)
  })

  await check("block: Block asks first, then shows Blocked, and ends the follow in both directions", async () => {
    await openProfile(me.page, them.handle)
    await me.page.locator("main").getByRole("button", { name: "More options" }).first().click()
    await me.page.getByRole("menuitem", { name: `Block @${them.handle}` }).click()
    const dialog = me.page.getByRole("dialog", { name: `Block @${them.handle}?` })
    await dialog.waitFor()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await dialog.waitFor({ state: "detached" })
    await unfollowButton(me.page, them.handle).waitFor()
    await block(me.page, them.handle)
    await me.page.getByRole("button", { name: `Unblock @${them.handle}` }).waitFor()
    await me.page.getByText("You blocked this account").waitFor()
    assert.equal(await followButton(me.page, them.handle).count(), 0, "a Follow button is offered on a blocked profile")
    await go(me.page, `/${me.handle}/following`, me.page.locator("main nav").first())
    assert.equal(await me.page.getByRole("link", { name: `${them.name}'s profile` }).count(), 0, "a blocked account is still in Following")
    await openHome(me.page, "following")
    assert.equal(await noPost(me.page, theirPost), true, "a blocked account's post is still in the Following feed")
  })

  await check("block: the blocked person sees the same not-here page for the blocker's profile as for an unknown handle", async () => {
    const blocked = await notHere(them.page, `/${me.handle}`)
    const unknown = await notHere(them.page, `/${missingHandle()}`)
    assert.equal(blocked, unknown, "the blocker's profile answers differently from an unknown handle")
    await go(them.page, `/search?q=${me.handle}&f=people`, them.page.locator("input#search-q"))
    await them.page.getByText(/No people match/).waitFor()
    await openHome(them.page, "following")
    assert.equal(await noPost(them.page, myPost), true, "the blocker's post shows in the blocked person's feed")
  })

  await check("block: Privacy and safety lists the blocked account, and Unblock opens the profile again without the follow", async () => {
    await openPrivacy(me.page)
    const row = privacyRow(me.page, them.handle)
    await row.waitFor()
    await acted(me.page, () => row.getByRole("button", { name: "Unblock", exact: true }).click())
    await toastText(me.page, /^Unblocked @/)
    await openProfile(me.page, them.handle)
    await followButton(me.page, them.handle).waitFor()
    await waitForPost(me.page, theirPost)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Muted words
// ---------------------------------------------------------------------------------------------------------------------

async function mutedWordsFlow() {
  const reader = await createUser({ tag: "mwr" })
  const writer = await createUser({ tag: "mww" })
  const word = `quasar${randomWord(6)}`
  const tag = `tagged${randomWord(6)}`
  const hidden = `Something about ${word} and more ${RUN_ID}`
  const shown = uniq("A different post")
  const tagged = `Using the hashtag #${tag} ${RUN_ID}`
  await follow(reader.page, writer.handle)
  await writePost(writer.page, hidden)
  await writePost(writer.page, shown)
  await writePost(writer.page, tagged)

  await check("muted words: before muting, the posts show in the Following feed", async () => {
    await openHome(reader.page, "following")
    await waitForPost(reader.page, hidden)
    await waitForPost(reader.page, shown)
  })

  await check("muted words: a muted word is listed, and posts with it leave the feed and the search results", async () => {
    await addMutedWord(reader.page, word)
    await reader.page.getByLabel(`Unmute ${word}`).waitFor()
    await openHome(reader.page, "following")
    await waitForPost(reader.page, shown)
    assert.equal(await reader.page.locator("article").filter({ hasText: hidden }).count(), 0, "a post with a muted word is in the Following feed")
    await go(reader.page, `/search?q=${encodeURIComponent(word)}`, reader.page.locator("input#search-q"))
    await reader.page.getByText(/No results for/).waitFor()
    await go(writer.page, `/search?q=${encodeURIComponent(word)}`, writer.page.locator("input#search-q"))
    await waitForPost(writer.page, hidden)
  })

  await check("muted words: a muted hashtag empties its topic page for that person only", async () => {
    await go(reader.page, `/topics/${tag}`, reader.page.getByRole("button", { name: `Follow the topic #${tag}` }))
    await waitForPost(reader.page, tagged)
    await addMutedWord(reader.page, `#${tag}`)
    await go(reader.page, `/topics/${tag}`, reader.page.getByRole("button", { name: `Follow the topic #${tag}` }))
    await reader.page.getByText(`No posts about #${tag} yet`).waitFor()
    await go(writer.page, `/topics/${tag}`, writer.page.getByRole("button", { name: `Follow the topic #${tag}` }))
    await waitForPost(writer.page, tagged)
  })

  await check("muted words: Remove brings the posts back", async () => {
    await removeMutedWord(reader.page, word)
    await removeMutedWord(reader.page, tag)
    await openHome(reader.page, "following")
    await waitForPost(reader.page, hidden)
    await waitForPost(reader.page, tagged)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------------------

async function createList(page, { name, description, isPrivate = false }) {
  // The form opens from New list in the header, so the page starts with the lists themselves.
  await go(page, "/lists", page.getByRole("button", { name: "New list", exact: true }))
  await page.getByRole("button", { name: "New list", exact: true }).click()
  await page.locator("input[name=name]").waitFor()
  await page.locator("input[name=name]").fill(name)
  if (description) await page.locator("input[name=description]").fill(description)
  if (isPrivate) await page.locator("input[name=private]").check()
  await acted(page, () => page.getByRole("button", { name: "Create list", exact: true }).click())
  await toastText(page, /^List created/)
  await page.waitForURL((url) => /^\/lists\/[^/]+$/.test(url.pathname))
  return new URL(page.url()).pathname.split("/").pop()
}

async function listsFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const owner = await createUser({ tag: phone ? "lop" : "lod", phone })
  const member = await createUser({ tag: phone ? "lmp" : "lmd", phone })
  const viewer = await createUser({ tag: phone ? "lvp" : "lvd", phone })
  const memberPost = uniq("Post from a list member")
  const listName = uniq("Reading list")
  const about = uniq("About this list")
  await writePost(member.page, memberPost)
  let listId = null

  await check(`${where}: Make a list creates it and opens its page, empty at first`, async () => {
    listId = await createList(owner.page, { name: listName, description: about })
    await owner.page.getByRole("heading", { name: listName }).waitFor()
    await owner.page.getByText(about, { exact: true }).waitFor()
    await owner.page.getByText("This list is empty").waitFor()
    assert.match(await bodyText(owner.page), /0 members/)
  })

  await check(`${where}: adding a person by handle fills the Posts tab and the Members tab`, async () => {
    need(listId, "the list")
    const input = owner.page.getByRole("textbox", { name: "Handle" })
    await ready(input)
    await input.fill(member.handle)
    await acted(owner.page, () => owner.page.getByRole("button", { name: "Add", exact: true }).click())
    await toastText(owner.page, new RegExp(`^Added @${member.handle} to the list`, "i"))
    await waitForPost(owner.page, memberPost)
    await owner.page.getByRole("link", { name: "Members" }).click()
    await owner.page.getByRole("button", { name: `Remove @${member.handle} from this list` }).waitFor()
    assert.match(await bodyText(owner.page), /1 member/)
  })

  await check(`${where}: adding a missing handle, or the same person twice, gives a plain error`, async () => {
    need(listId, "the list")
    const input = owner.page.getByRole("textbox", { name: "Handle" })
    await input.fill(`nobody${randomWord(6)}`)
    await owner.page.getByRole("button", { name: "Add", exact: true }).click()
    assert.match(await alertText(owner.page.locator("main"), { match: /doesn.t exist/ }), /doesn.t exist/)
    await input.fill(member.handle)
    await owner.page.getByRole("button", { name: "Add", exact: true }).click()
    assert.match(await alertText(owner.page.locator("main"), { match: /already on this list/ }), /already on this list/)
  })

  await check(`${where}: the Lists page shows the list with its member count`, async () => {
    // The create form opens from New list, so the page is ready when that button is there.
    await go(owner.page, "/lists", owner.page.getByRole("button", { name: "New list" }))
    const row = owner.page.getByRole("link").filter({ hasText: listName }).first()
    await row.waitFor()
    assert.match(await row.innerText(), new RegExp(`1 member\\s*·\\s*by @${owner.handle}`, "i"))
  })

  await check(`${where}: someone else can open a public list, read it and follow it, but cannot change it`, async () => {
    need(listId, "the list")
    await go(viewer.page, `/lists/${listId}`, viewer.page.getByRole("button", { name: "Follow list" }))
    await waitForPost(viewer.page, memberPost)
    assert.equal(await viewer.page.getByRole("button", { name: "Delete list" }).count(), 0, "a visitor is offered Delete list")
    assert.equal(await viewer.page.getByRole("textbox", { name: "Handle" }).count(), 0, "a visitor is offered the Add person form")
    await acted(viewer.page, () => viewer.page.getByRole("button", { name: "Follow list" }).click())
    await toastText(viewer.page, /^You follow this list/)
    await viewer.page.getByRole("button", { name: /^Following$/ }).waitFor()
    await go(viewer.page, "/lists", viewer.page.getByRole("heading", { name: "Lists you follow" }))
    await viewer.page.getByRole("link").filter({ hasText: listName }).first().waitFor()
    await go(viewer.page, `/lists/${listId}`, viewer.page.getByRole("button", { name: /^Following$/ }))
    await acted(viewer.page, () => viewer.page.getByRole("button", { name: /^Following$/ }).click())
    await toastText(viewer.page, /^You stopped following this list/)
    await viewer.page.getByRole("button", { name: "Follow list" }).waitFor()
  })

  await check(`${where}: a private list opens for its owner and answers 404 to everyone else`, async () => {
    const privateName = uniq("Private list")
    const privateId = await createList(owner.page, { name: privateName, isPrivate: true })
    await owner.page.getByText("Private. Only you can see it.").waitFor()
    const privateAnswer = await notHere(viewer.page, `/lists/${privateId}`)
    const unknownAnswer = await notHere(viewer.page, `/lists/${missingId()}`)
    assert.equal(privateAnswer, unknownAnswer, "a private list answers differently from a list that does not exist")
    await go(viewer.page, "/lists", viewer.page.getByRole("heading", { name: "Your lists" }))
    assert.equal(await gone(viewer.page.getByRole("link").filter({ hasText: privateName })), 0, "a private list is listed for another person")
  })

  await check(`${where}: Remove takes a person off the list, and Delete list asks before it deletes`, async () => {
    need(listId, "the list")
    await go(owner.page, `/lists/${listId}?tab=members`, owner.page.getByRole("button", { name: `Remove @${member.handle} from this list` }))
    await acted(owner.page, () => owner.page.getByRole("button", { name: `Remove @${member.handle} from this list` }).click())
    await toastText(owner.page, /^Removed @.* from the list/)
    await owner.page.getByText("Nobody is on this list").waitFor()

    await owner.page.getByRole("button", { name: "Delete list" }).click()
    const dialog = owner.page.getByRole("dialog", { name: "Delete this list?" })
    await dialog.waitFor()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await dialog.waitFor({ state: "detached" })
    await owner.page.getByRole("heading", { name: listName }).waitFor()
    await owner.page.getByRole("button", { name: "Delete list" }).click()
    await dialog.waitFor()
    await acted(owner.page, () => dialog.getByRole("button", { name: "Delete list" }).click())
    await toastText(owner.page, /^List deleted/)
    await owner.page.waitForURL((url) => url.pathname === "/lists")
    assert.equal(await gone(owner.page.getByRole("link").filter({ hasText: listName })), 0, "a deleted list is still listed")
    const deletedAnswer = await notHere(viewer.page, `/lists/${listId}`)
    const unknownAnswer = await notHere(viewer.page, `/lists/${missingId()}`)
    assert.equal(deletedAnswer, unknownAnswer, "a deleted list answers differently from a list that does not exist")
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------------------------------------------------

async function topicsFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const writer = await createUser({ tag: phone ? "tpw" : "tdw", phone })
  const reader = await createUser({ tag: phone ? "tpr" : "tdr", phone })
  const other = await createUser({ tag: phone ? "tpo" : "tdo", phone })
  const tag = `topic${randomWord(6)}`
  const first = uniq(`Post about #${tag}`)
  await writePost(writer.page, first)
  const followButtonFor = (page) => page.getByRole("button", { name: `Follow the topic #${tag}` })
  const unfollowButtonFor = (page) => page.getByRole("button", { name: `Following the topic #${tag}` })

  await check(`${where}: a hashtag in a post links to its topic page, which lists the post`, async () => {
    await openProfile(reader.page, writer.handle)
    const shown = await waitForPost(reader.page, first)
    await shown.getByRole("link", { name: `#${tag}`, exact: true }).click()
    await reader.page.waitForURL((url) => url.pathname === `/topics/${tag}`)
    await reader.page.getByRole("heading", { name: `#${tag}`, exact: true }).waitFor()
    await waitForPost(reader.page, first)
  })

  await check(`${where}: following a topic puts its posts in the Following feed, even from people not followed`, async () => {
    await acted(reader.page, () => followButtonFor(reader.page).click())
    await toastText(reader.page, new RegExp(`^You follow #${tag}`))
    await unfollowButtonFor(reader.page).waitFor()
    await reader.page.reload()
    await unfollowButtonFor(reader.page).waitFor()
    const second = uniq(`Another word on #${tag}`)
    await writePost(other.page, second)
    await openHome(reader.page, "following")
    await waitForPost(reader.page, second)
  })

  await check(`${where}: unfollowing the topic stops new posts from coming into the Following feed`, async () => {
    await go(reader.page, `/topics/${tag}`, unfollowButtonFor(reader.page))
    await acted(reader.page, () => unfollowButtonFor(reader.page).click())
    await toastText(reader.page, new RegExp(`^You unfollowed #${tag}`))
    await followButtonFor(reader.page).waitFor()
    const third = uniq(`A late post on #${tag}`)
    await writePost(other.page, third)
    await openHome(reader.page, "following")
    assert.equal(await noPost(reader.page, third), true, "a post on an unfollowed topic came into the Following feed")
  })

  await check(`${where}: a topic nobody used is empty, and a malformed topic is a 404`, async () => {
    const unused = `unused${randomWord(8)}`
    await go(reader.page, `/topics/${unused}`, reader.page.getByRole("button", { name: `Follow the topic #${unused}` }))
    await reader.page.getByText(`No posts about #${unused} yet`).waitFor()
    await notHere(reader.page, "/topics/not%20a%20topic")
  })

  await check(`${where}: the trending topics on Explore open a topic page`, async () => {
    await go(reader.page, "/explore?tab=trending", reader.page.getByRole("heading", { name: "Trending topics", exact: true }))
    const trending = reader.page.locator("section[aria-labelledby='trending-heading']")
    await trending.waitFor()
    const link = trending.getByRole("link").first()
    const label = (await link.getByText(/^#/).first().innerText()).trim()
    assert.match(label, /^#\w+/, "the first trending topic is not a hashtag")
    await link.click()
    await reader.page.waitForURL((url) => url.pathname.startsWith("/topics/"))
    await reader.page.getByRole("heading", { name: label, exact: true }).waitFor()
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Search with operators
// ---------------------------------------------------------------------------------------------------------------------

async function searchFlow() {
  const authorA = await createUser({ tag: "sra" })
  const authorB = await createUser({ tag: "srb" })
  const viewer = await createUser({ tag: "srv" })
  const token = `needle${randomWord(8)}`
  const apple = `${token} apple first ${RUN_ID}`
  const picture = `${token} picture post ${RUN_ID}`
  const banana = `${token} banana ${RUN_ID}`
  const reply = `${token} reply to the apple ${RUN_ID}`

  await writePost(authorA.page, apple)
  await openHome(authorA.page)
  const form = homeComposer(authorA.page)
  await attach(form, makePng("search-picture.png", { seed: 7 }))
  await form.locator('img[alt="Selected image"]').waitFor()
  await typeIn(form, picture)
  await acted(authorA.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(authorA.page, /^Posted\./)
  await writePost(authorB.page, banana)
  await openProfile(authorB.page, authorA.handle)
  const target = await waitForPost(authorB.page, apple)
  await replyButton(target).click()
  const dialog = authorB.page.getByRole("dialog", { name: "Reply" })
  await dialog.waitFor()
  await typeIn(dialog, reply)
  await acted(authorB.page, () => dialog.getByRole("button", { name: "Reply", exact: true }).click())
  await toastText(authorB.page, /Reply posted/)
  await openProfile(viewer.page, authorB.handle)
  await acted(viewer.page, async () => likeButton(await waitForPost(viewer.page, banana)).click())

  await check("search: a word finds every post that has it", async () => {
    await openSearch(viewer.page, token)
    for (const text of [apple, picture, banana, reply]) await waitForPost(viewer.page, text, { reload: true })
  })

  await check("search: from: keeps one person's posts", async () => {
    await openSearch(viewer.page, `${token} from:${authorA.handle}`)
    await waitForPost(viewer.page, apple)
    await waitForPost(viewer.page, picture)
    assert.equal((await cardCount(viewer.page, banana)) + (await cardCount(viewer.page, reply)), 0, "from: let another person's post through")
  })

  await check("search: -word leaves out posts that have the word", async () => {
    await openSearch(viewer.page, `${token} -banana`)
    await waitForPost(viewer.page, apple)
    assert.equal(await cardCount(viewer.page, banana), 0, "the excluded word's post is in the results")
  })

  await check("search: filter:images keeps posts with a picture", async () => {
    await openSearch(viewer.page, `${token} filter:images`)
    await waitForPost(viewer.page, picture)
    assert.equal((await cardCount(viewer.page, apple)) + (await cardCount(viewer.page, banana)), 0, "filter:images let a post without a picture through")
  })

  await check("search: to: keeps replies to one person", async () => {
    await openSearch(viewer.page, `${token} to:${authorA.handle}`)
    await waitForPost(viewer.page, reply)
    assert.equal((await cardCount(viewer.page, apple)) + (await cardCount(viewer.page, banana)), 0, "to: let a post that is not a reply to that person through")
  })

  await check("search: min_likes: keeps posts with enough likes", async () => {
    await openSearch(viewer.page, `${token} min_likes:1`)
    await waitForPost(viewer.page, banana)
    assert.equal((await cardCount(viewer.page, apple)) + (await cardCount(viewer.page, picture)), 0, "min_likes:1 let an unliked post through")
  })

  await check("search: since: and until: limit the dates", async () => {
    await openSearch(viewer.page, `${token} since:2099-01-01`)
    await viewer.page.getByText(/No results for/).waitFor()
    await openSearch(viewer.page, `${token} until:2000-01-01`)
    await viewer.page.getByText(/No results for/).waitFor()
    await openSearch(viewer.page, `${token} since:2020-01-01 until:2099-12-31`)
    await waitForPost(viewer.page, apple)
  })

  await check("search: a quoted phrase must match as written", async () => {
    await openSearch(viewer.page, `"${token} apple"`)
    await waitForPost(viewer.page, apple)
    assert.equal(await cardCount(viewer.page, banana), 0, "the phrase search let a post without the phrase through")
  })

  await check("search: the Media tab shows pictures only, and Latest and Top keep the results", async () => {
    await openSearch(viewer.page, token)
    await viewer.page.getByRole("link", { name: "Media" }).click()
    await viewer.page.waitForURL((url) => url.searchParams.get("f") === "media")
    await waitForPost(viewer.page, picture)
    assert.equal(await cardCount(viewer.page, banana), 0, "the Media tab lists a post without a picture")
    await viewer.page.getByRole("link", { name: "Latest" }).click()
    await viewer.page.waitForURL((url) => url.searchParams.get("f") === "latest")
    await waitForPost(viewer.page, banana)
  })

  await check("search: the People tab finds a person by handle and offers Follow", async () => {
    await openSearch(viewer.page, authorA.handle, "people")
    await viewer.page.getByRole("link", { name: `${authorA.name}'s profile` }).first().waitFor()
    await followButton(viewer.page, authorA.handle).waitFor()
  })

  await check("search: typing in the search box and pressing Enter runs the search, and it is remembered", async () => {
    await go(viewer.page, "/explore", viewer.page.locator("input#search-q"))
    const field = viewer.page.locator("input#search-q")
    await field.fill(`${token} from:${authorB.handle}`)
    await field.press("Enter")
    await viewer.page.waitForURL((url) => url.pathname === "/search" && (url.searchParams.get("q") ?? "").includes(`from:${authorB.handle}`))
    await waitForPost(viewer.page, banana)
    await go(viewer.page, "/search", viewer.page.locator("input#search-q"))
    const recent = viewer.page.getByRole("region", { name: "Recent searches" })
    await recent.getByRole("link", { name: `${token} from:${authorB.handle}` }).waitFor()
    await acted(viewer.page, () => recent.getByRole("button", { name: "Clear all" }).click())
    await recent.waitFor({ state: "detached" })
  })

  await check("search: the page with no query explains the operators", async () => {
    await go(viewer.page, "/search", viewer.page.locator("input#search-q"))
    const text = await bodyText(viewer.page)
    for (const operator of ["from:handle", "to:handle", "filter:images", "min_likes:10", "-word"]) {
      assert.ok(text.includes(operator), `the search help does not mention ${operator}`)
    }
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------------------------------------------------

async function exploreFlow() {
  const author = await createUser({ tag: "exa" })
  const viewer = await createUser({ tag: "exv" })
  const textPost = uniq("Explore text post")
  const picturePost = uniq("Explore picture post")
  await writePost(author.page, textPost)
  await openHome(author.page)
  const form = homeComposer(author.page)
  await attach(form, makePng("explore-picture.png", { seed: 11 }))
  await form.locator('img[alt="Selected image"]').waitFor()
  await typeIn(form, picturePost)
  await acted(author.page, () => form.getByRole("button", { name: "Post", exact: true }).click())
  await toastText(author.page, /^Posted\./)

  await check("explore: the ranking link switches to the newest posts, which include a post from someone not followed", async () => {
    await go(viewer.page, "/explore", viewer.page.getByRole("link", { name: /^Ranked for you/ }))
    await viewer.page.getByRole("link", { name: /^Ranked for you/ }).click()
    await viewer.page.waitForURL((url) => url.searchParams.get("sort") === "latest")
    await viewer.page.getByRole("link", { name: /^Latest first/ }).waitFor()
    await waitForPost(viewer.page, textPost)
    await waitForPost(viewer.page, picturePost)
  })

  await check("explore: the media switch keeps only posts with a picture", async () => {
    await go(viewer.page, "/explore?sort=latest", viewer.page.getByRole("switch", { name: "Only posts with photos or videos" }))
    await viewer.page.getByRole("switch", { name: "Only posts with photos or videos" }).click()
    await viewer.page.waitForURL((url) => url.searchParams.get("media") === "1")
    await waitForPost(viewer.page, picturePost)
    assert.equal(await cardCount(viewer.page, textPost), 0, "the media switch lets a post without a picture through")
    assert.equal(await viewer.page.getByRole("switch", { name: "Only posts with photos or videos" }).getAttribute("aria-checked"), "true")
  })

  await check("explore: Who to follow offers people and the Follow button works", async () => {
    // The right-hand column only exists on wide screens; the Follow button on a profile does the same job everywhere.
    await openProfile(viewer.page, author.handle)
    await acted(viewer.page, () => followButton(viewer.page, author.handle).click())
    await unfollowButton(viewer.page, author.handle).waitFor()
  })
}
