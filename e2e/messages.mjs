// Direct messages and group chats: requests, accepting and declining, sending text and photos, reactions, sharing a post,
// deleting a message, muting a conversation, creating a group, renaming it, adding and removing people, and leaving.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { OUT, RUN_ID, TIMEOUT, escapeRegExp, randomWord, sleep } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import {
  chatBox,
  waitForConversation,
  closeGroupInfo,
  createGroupChat,
  messageRow,
  openChat,
  openGroupInfo,
  react,
  reactionChip,
  sendChat,
  threadText,
} from "./lib/chat.mjs"
import { makePng } from "./lib/files.mjs"
import { query } from "./lib/db.mjs"
import { allowNoise } from "./lib/watch.mjs"
import { expectBanner, idleOnSettings } from "./lib/live.mjs"
import { block, follow } from "./lib/people.mjs"
import { cardMenu, cardPostId, openProfile, waitForPost, writePost } from "./lib/posts.mjs"
import { acted, alertText, bodyText, go, missingId, notHere, ready, toastText, until } from "./lib/ui.mjs"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

// With encryption on, a chat row shows the fixed label for a sealed message, never its text (lib/e2ee-payload.ts). The
// rows below are found by the label the page really shows, so the same check works in both modes.
const ENCRYPTED = process.env.RHENKO_E2EE === "1"
const ENCRYPTED_PREVIEW = "Encrypted message"
function previewOf(text) {
  return ENCRYPTED ? ENCRYPTED_PREVIEW : text
}

// Resolves once the server has saved a message from this handle in the conversation. Used where the request carries sealed
// text, so the words are not there to wait for.
async function savedInChat(conversationId, handle) {
  const deadline = Date.now() + TIMEOUT
  for (;;) {
    const [row] = await query(
      "SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id = ? AND cipher IS NOT NULL AND sender_id = (SELECT id FROM users WHERE handle = ?)",
      conversationId,
      handle
    )
    if (Number(row.n) > 0) return
    if (Date.now() > deadline) throw new Error(`no sealed message from @${handle} was saved in ${conversationId} within ${TIMEOUT} ms`)
    await sleep(200)
  }
}

export async function run() {
  area("messages")
  for (const phone of [false, true]) {
    const where = phone ? "a phone" : "a computer"
    await guard(`direct messages on ${where}`, () => directFlow({ phone }))
    await guard(`group chat on ${where}`, () => groupFlow({ phone }))
  }
  await guard("declining a request and starting chats", requestsFlow)
}

// The Messages list page. Its tabs are named "Messages sections".
async function openMessages(page, tab) {
  await go(page, tab ? `/messages?tab=${tab}` : "/messages", page.getByRole("navigation", { name: "Messages sections" }))
}

// ---------------------------------------------------------------------------------------------------------------------
// One-to-one chat
// ---------------------------------------------------------------------------------------------------------------------

// The mute switch is a row in the chat's options: a menu item on a computer, and a button in the drawer on a phone.
function muteRow(page, label) {
  return page
    .getByRole("menuitem", { name: label, exact: true })
    .or(page.getByRole("dialog", { name: "Chat options" }).getByRole("button", { name: label, exact: true }))
}

async function clickMuteSwitch(page, label) {
  await page.getByRole("button", { name: "Chat options" }).click()
  await acted(page, () => muteRow(page, label).click())
  // The phone drawer stays open after a tap, where the menu closed by itself, so close it here.
  await page.keyboard.press("Escape")
}

// Waits until the mute switch offers this label. That means opening the options to read its row.
async function waitForMuteLabel(page, label) {
  await page.getByRole("button", { name: "Chat options" }).click()
  await muteRow(page, label).waitFor()
  await page.keyboard.press("Escape")
  await muteRow(page, label).waitFor({ state: "detached" })
}

async function directFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const sender = await createUser({ tag: phone ? "dsp" : "dsd", phone })
  const receiver = await createUser({ tag: phone ? "drp" : "drd", phone })
  const first = uniq("First message")
  const second = uniq("Answer to the first")
  let convId = null

  await check(`${where}: Message on a profile opens a chat, and a first message to someone who does not follow back arrives as a live request`, async () => {
    await idleOnSettings(receiver.page)
    const banner = expectBanner(receiver.page, "Sent you a message request")
    await openProfile(sender.page, receiver.handle)
    await sender.page.getByRole("button", { name: /^Message @/ }).click()
    convId = await waitForConversation(sender.page)
    await sender.page.getByText("No messages yet. Say hello.").waitFor()
    await sendChat(sender.page, first)
    assert.equal(await banner, true, "the receiver got no banner for the message request")
  })

  await check(`${where}: the request waits under Requests, and its thread offers Accept and Decline but no composer`, async () => {
    need(convId, "the conversation")
    await openMessages(receiver.page)
    const note = receiver.page.getByRole("link", { name: /1 message request/ })
    await note.waitFor()
    await note.click()
    await receiver.page.waitForURL((url) => url.searchParams.get("tab") === "requests")
    const row = receiver.page.locator("main").getByRole("link").filter({ hasText: sender.name }).filter({ hasText: previewOf(first) }).first()
    await row.waitFor()
    await row.click()
    await receiver.page.waitForURL((url) => url.pathname === `/messages/${convId}`)
    await receiver.page.getByText("Accept this message request to reply.").waitFor()
    await receiver.page.getByText("Accept the request to reply.").waitFor()
    await threadText(receiver.page, first).waitFor()
    assert.equal(await chatBox(receiver.page).count(), 0, "a message box is offered before the request is accepted")
    assert.equal(await receiver.page.getByRole("button", { name: `Call ${sender.name}`, exact: true }).isDisabled(), true, "the call button works before the request is accepted")
    await openChat(sender.page, convId)
    assert.equal(await sender.page.getByText(/^Seen/).count(), 0, "the sender is told the message was seen before the request was accepted")
  })

  await check(`${where}: Accept opens the message box, and the reply reaches the sender without a reload and marks the thread as seen`, async () => {
    need(convId, "the conversation")
    await acted(receiver.page, () => receiver.page.getByRole("button", { name: "Accept", exact: true }).click())
    await toastText(receiver.page, /^Request accepted/)
    await chatBox(receiver.page).waitFor()
    await sendChat(receiver.page, second)
    await threadText(sender.page, second).waitFor()
    await sender.page.getByText(/^Seen/).first().waitFor()
  })

  await check(`${where}: a message from the other person can be reported, and the server seals the report for the report key`, async () => {
    need(convId, "the conversation")
    await messageRow(receiver.page, first).getByRole("button", { name: "More message options" }).click()
    await receiver.page.getByRole("menuitem", { name: "Report", exact: true }).click()
    const dialog = receiver.page.getByRole("dialog", { name: "Report message" })
    await dialog.getByText("Abusive or harmful", { exact: true }).click()
    await acted(receiver.page, () => dialog.getByRole("button", { name: "Report", exact: true }).click())
    await toastText(receiver.page, "Report sent.")
    const rows = await query("SELECT kid, reason, reported_user_id, sealed FROM chat_reports WHERE conversation_id = ?", convId)
    assert.equal(rows.length, 1, `expected one report of the chat, found ${rows.length}`)
    assert.equal(rows[0].reason, "Abusive or harmful")
    const [who] = await query("SELECT id FROM users WHERE handle = ?", sender.handle)
    assert.equal(rows[0].reported_user_id, who?.id, "the report names someone other than the sender")
    assert.ok(!rows[0].sealed.includes(first), "the reported words are stored in the clear")
    assert.equal(JSON.parse(rows[0].sealed).kid, rows[0].kid, "the report is not sealed to the key it names")
  })

  await check(`${where}: a child-safety report takes the message off the chat for both people at once, and keeps the record`, async () => {
    need(convId, "the conversation")
    const words = uniq("Reported at once")
    await sendChat(receiver.page, words)
    await threadText(sender.page, words).waitFor()
    await messageRow(sender.page, words).getByRole("button", { name: "More message options" }).click()
    await sender.page.getByRole("menuitem", { name: "Report", exact: true }).click()
    const dialog = sender.page.getByRole("dialog", { name: "Report message" })
    await dialog.getByText("Child sexual abuse material", { exact: true }).click()
    await acted(sender.page, () => dialog.getByRole("button", { name: "Report", exact: true }).click())
    await toastText(sender.page, /taken off the chat/)
    // The pointer still rests over the toast, and a toast under the pointer stays up. Move it away and let the toast clear, so it does
    // not cover the buttons of the sheets the next checks open.
    await sender.page.mouse.move(0, 0)
    await sender.page.locator("[data-sonner-toast]").filter({ hasText: /taken off the chat/ }).waitFor({ state: "detached" })
    await threadText(sender.page, words).waitFor({ state: "detached" })
    await threadText(receiver.page, words).waitFor({ state: "detached" })
    const [report] = await query(
      "SELECT id, message_id, reason, sealed, retain_until, created_at FROM chat_reports WHERE conversation_id = ? AND reason = ?",
      convId,
      "Child sexual abuse material"
    )
    need(report, "the child-safety report")
    assert.ok(!report.sealed.includes(words), "the reported words are stored in the clear")
    assert.ok(Number(report.retain_until) - Number(report.created_at) >= 364 * 24 * 60 * 60 * 1000, "the report is not kept for a year")
    const [message] = await query("SELECT body, deleted_at, media_file, attachment FROM chat_messages WHERE id = ?", report.message_id)
    assert.equal(message.body, "", "the words of the removed message are still stored")
    assert.notEqual(message.deleted_at, null, "the removed message is not marked deleted")
    const removals = await query("SELECT category, source FROM chat_message_removals WHERE message_id = ?", report.message_id)
    assert.equal(removals.length, 1, `expected one record of the removal, found ${removals.length}`)
    assert.equal(removals[0].category, "child_abuse")
    assert.equal(removals[0].source, `chat-report:${report.id}`)
  })

  await check(`${where}: a reaction shows on both sides, and pressing it again takes it back`, async () => {
    const emoji = await react(receiver.page, first)
    await reactionChip(receiver.page, first, emoji, 1, true).waitFor()
    await reactionChip(sender.page, first, emoji, 1, false).waitFor()
    await acted(receiver.page, () => reactionChip(receiver.page, first, emoji, 1, true).click())
    await reactionChip(receiver.page, first, emoji, 1, true).waitFor({ state: "detached" })
    await reactionChip(sender.page, first, emoji, 1, false).waitFor({ state: "detached" })
  })

  await check(`${where}: a message that does not reach the server gives a reason, keeps its text, and sends once the connection is back`, async () => {
    const page = sender.page
    const words = uniq("Sent while offline")
    // How many places in the thread show the words. The composer's own box holds the same text, so it is not counted.
    const inThread = () =>
      page.evaluate(
        (text) => [...document.querySelectorAll("main *")].filter((el) => el.tagName !== "TEXTAREA" && el.childElementCount === 0 && el.textContent.trim() === text).length,
        words
      )
    // While offline the browser logs each request it could not make, and the send is one of them. Nothing shows that log;
    // the check still looks for the reason on the screen. Allowed for this page during this check only.
    const endAllow = allowNoise({
      id: "request-while-offline",
      kind: "console",
      text: /Failed to load resource: net::ERR_INTERNET_DISCONNECTED/,
      url: /^https?:\/\/[^/]+\/messages\//,
      reason: "The check takes the connection away on purpose, so the request that the send makes is logged as not reached.",
    })
    await sender.context.setOffline(true)
    try {
      await chatBox(page).fill(words)
      await chatBox(page).press("Enter")
      // A plaintext send says why in place. An encrypted one says why in a notice, because its text is sealed on this device first.
      if (ENCRYPTED) await toastText(page, /did not send/)
      else await page.getByRole("alert").filter({ hasText: "did not send" }).waitFor()
      await until(page, () => document.querySelectorAll("[data-flight]").length === 0)
      assert.equal(await chatBox(page).inputValue(), words, "the text left the box although the message did not send")
      assert.equal(await inThread(), 0, "the failed message is still in the thread")
    } finally {
      await sender.context.setOffline(false)
      endAllow()
    }
    await chatBox(page).press("Enter")
    await threadText(receiver.page, words).waitFor()
    assert.equal(await inThread(), 1, "the message is not in the thread once")
  })

  await check(`${where}: a photo can be sent and loads for both people`, async () => {
    await sender.page.locator("input[name=image]").setInputFiles(makePng(`chat-${where}.png`, { seed: 5 }))
    // A photo opens the framing step first, so it is kept as framed before it is previewed.
    const framing = sender.page.getByRole("dialog", { name: "Frame your photo" })
    await framing.getByRole("button", { name: "Use this", exact: true }).click()
    await framing.waitFor({ state: "detached" })
    await sender.page.getByText("Photo", { exact: true }).first().waitFor()
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    for (const person of [sender, receiver]) {
      await person.page.locator('main img[alt="Shared photo"]').first().waitFor()
      await until(person.page, () => {
        const image = document.querySelector('main img[alt="Shared photo"]')
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      })
    }
  })

  await check(`${where}: a voice message is recorded, sent, and can be played by both people`, async () => {
    await sender.page.getByRole("button", { name: "Record a voice message", exact: true }).click()
    await sender.page.getByText("Recording a voice message").waitFor()
    await sleep(1500)
    await sender.page.getByRole("button", { name: "Stop", exact: true }).click()
    await sender.page.getByText(/^Voice message · \d+:\d\d$/).waitFor()
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    for (const person of [sender, receiver]) {
      await person.page.locator('main audio[aria-label="Voice message"]').first().waitFor()
      // A plaintext voice message plays from the server's file. An encrypted one is opened on this device, so it plays from a blob.
      await until(
        person.page,
        (sealed) => {
          const audio = document.querySelector('main audio[aria-label="Voice message"]')
          return audio instanceof HTMLAudioElement && audio.readyState >= 1 && (sealed ? audio.src.startsWith("blob:") : audio.src.includes("/media/"))
        },
        ENCRYPTED,
        { timeout: 20_000 }
      )
    }
    // The preview in the composer is gone once the voice message has gone out.
    await sender.page.getByText(/^Voice message · /).waitFor({ state: "detached" })
  })

  await check(`${where}: sharing a post from its card puts it in the chat as a card the other person can open`, async () => {
    need(convId, "the conversation")
    const shareText = uniq("A post worth sharing")
    const note = uniq("Look at this")
    await writePost(sender.page, shareText)
    await openProfile(sender.page, sender.handle)
    const shown = await waitForPost(sender.page, shareText)
    const postId = await cardPostId(shown)
    // Share is in the post's ⋯ menu.
    await cardMenu(sender.page, shown, "Share")
    const dialog = sender.page.getByRole("dialog", { name: "Share post" })
    await dialog.waitFor()
    await dialog.getByRole("textbox", { name: "Search people" }).fill(receiver.handle)
    await dialog.getByRole("button", { name: new RegExp(escapeRegExp(receiver.name)) }).first().click()
    await dialog.getByRole("textbox", { name: "Note" }).fill(note)
    await acted(sender.page, () => dialog.getByRole("button", { name: /^Send to / }).click())
    await dialog.getByText("Sent", { exact: true }).waitFor()
    await dialog.getByRole("link", { name: "Open chat" }).click()
    await sender.page.waitForURL((url) => url.pathname === `/messages/${convId}`)
    await sender.page.locator("main a[data-embed]").filter({ hasText: shareText }).waitFor()

    await openChat(receiver.page, convId)
    await threadText(receiver.page, note).waitFor()
    const embed = receiver.page.locator("main a[data-embed]").filter({ hasText: shareText })
    await embed.waitFor()
    assert.match((await embed.getAttribute("href")) ?? "", new RegExp(`/${sender.handle}/status/${postId}$`), "the shared card does not link to the post")
    await embed.click()
    await receiver.page.waitForURL((url) => url.pathname === `/${sender.handle}/status/${postId}`)
    await waitForPost(receiver.page, shareText)
  })

  await check(`${where}: the Screenshot tile makes a picture of a post that saves as a PNG`, async () => {
    const pictureText = uniq("A post for a picture")
    await writePost(sender.page, pictureText)
    await openProfile(sender.page, sender.handle)
    const shown = await waitForPost(sender.page, pictureText)
    await cardMenu(sender.page, shown, "Share")
    const dialog = sender.page.getByRole("dialog", { name: "Share post" })
    await dialog.waitFor()
    await dialog.getByRole("button", { name: "Screenshot", exact: true }).click()
    await dialog.getByRole("img", { name: `Picture of ${sender.name}'s post` }).waitFor()
    const [download] = await Promise.all([
      sender.page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Save picture", exact: true }).click(),
    ])
    const bytes = await readFile(await download.path())
    // Kept beside the run's screenshots, so the picture itself can be looked at after the run.
    await download.saveAs(join(OUT, `post-picture-${where.replace(/\W+/g, "-")}.png`))
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "the saved picture is not a PNG")
    assert.ok(bytes.length > 20000, `the saved picture is only ${bytes.length} bytes, too small to hold the post`)
    await dialog.getByRole("button", { name: "Back to sharing" }).click()
    await dialog.getByRole("textbox", { name: "Search people" }).waitFor()
  })

  await check(`${where}: only your own messages can be deleted, and a deleted message becomes a notice for both people`, async () => {
    need(convId, "the conversation")
    await openChat(sender.page, convId)
    await openChat(receiver.page, convId)
    const theirs = messageRow(sender.page, second)
    await theirs.hover()
    assert.equal(await theirs.getByRole("button", { name: "Delete message" }).count(), 0, "Delete message is offered on someone else's message")
    const mine = messageRow(sender.page, first)
    await mine.hover()
    await mine.getByRole("button", { name: "Delete message" }).click()
    const dialog = sender.page.getByRole("dialog", { name: "Delete this message?" })
    await dialog.waitFor()
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await dialog.waitFor({ state: "detached" })
    await threadText(sender.page, first).waitFor()
    await mine.hover()
    await mine.getByRole("button", { name: "Delete message" }).click()
    await acted(sender.page, () => dialog.getByRole("button", { name: "Delete", exact: true }).click())
    for (const person of [sender, receiver]) {
      // The child-safety report above already left a deleted notice in this thread, so wait for this message's own text to go, not for any notice.
      await threadText(person.page, first).waitFor({ state: "detached" }).catch(() => undefined) // the assertion below names any copy left
      await person.page.locator("main").getByText("This message was deleted.").first().waitFor()
      // On failure the message names the matching elements, so the copy that is still on the page can be read from the log.
      const copies = await person.page
        .locator("main")
        .getByText(first)
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const chain = []
            for (let el = node; el && el.tagName !== "MAIN"; el = el.parentElement) {
              const style = getComputedStyle(el)
              chain.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}[op=${style.opacity},vis=${style.visibility},disp=${style.display}]`)
            }
            return `text=${JSON.stringify(node.textContent)} chain=${chain.slice(0, 7).join(" > ")}`
          })
        )
      assert.equal(copies.length, 0, `the text of a deleted message is still on the page (${person.name}): ${copies.join(" | ")}`)
    }
  })

  await check(`${where}: the Messages list shows the newest message and a live unread count`, async () => {
    need(convId, "the conversation")
    const ping = uniq("Are you there")
    await openMessages(receiver.page)
    await openChat(sender.page, convId)
    await sendChat(sender.page, ping)
    const row = receiver.page.locator("main").getByRole("link").filter({ hasText: sender.name }).filter({ hasText: previewOf(ping) }).first()
    await row.waitFor()
    await row.getByLabel("1 unread message").waitFor()
    // Opening the thread marks it read. The check waits for the server to confirm that before leaving the page, so a
    // navigation can't cancel the mark on the way out.
    const marked = receiver.page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/api/conversations/${convId}/read`), { timeout: TIMEOUT })
    await row.click()
    await receiver.page.waitForURL((url) => url.pathname === `/messages/${convId}`)
    await threadText(receiver.page, ping).waitFor()
    await marked
    await openMessages(receiver.page)
    const read = receiver.page.locator("main").getByRole("link").filter({ hasText: sender.name }).first()
    await read.waitFor()
    assert.equal(await read.getByLabel(/unread message/).count(), 0, "the unread count stays after the thread was opened")
  })

  await check(`${where}: a muted conversation brings no banners, and unmuting brings them back`, async () => {
    need(convId, "the conversation")
    const quiet = uniq("Quiet message")
    const loud = uniq("Loud message")
    await openChat(receiver.page, convId)
    await clickMuteSwitch(receiver.page, "Mute conversation")
    await toastText(receiver.page, /^Conversation muted/)
    await waitForMuteLabel(receiver.page, "Unmute conversation")
    await idleOnSettings(receiver.page)
    const missing = expectBanner(receiver.page, previewOf(quiet), 5000)
    await openChat(sender.page, convId)
    await sendChat(sender.page, quiet)
    assert.equal(await missing, false, "a muted conversation produced a banner")

    await openChat(receiver.page, convId)
    await clickMuteSwitch(receiver.page, "Unmute conversation")
    await toastText(receiver.page, /^Conversation unmuted/)
    await idleOnSettings(receiver.page)
    const shown = expectBanner(receiver.page, previewOf(loud))
    await sendChat(sender.page, loud)
    assert.equal(await shown, true, "an unmuted conversation produced no banner")
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------------------------------------------------

async function groupFlow({ phone }) {
  const where = phone ? "phone" : "desktop"
  const creator = await createUser({ tag: phone ? "gcp" : "gcd", phone })
  const one = await createUser({ tag: phone ? "g1p" : "g1d", phone })
  const two = await createUser({ tag: phone ? "g2p" : "g2d", phone })
  const invitee = await createUser({ tag: phone ? "gip" : "gid", phone })
  // People who follow the creator join a group at once. Anyone else is invited and joins when they accept.
  await follow(one.page, creator.handle)
  await follow(two.page, creator.handle)
  const name = uniq("Study group")
  const renamed = uniq("Renamed group")
  let groupId = null

  await check(`${where}: a group needs two other people and real handles`, async () => {
    await go(creator.page, "/messages/new", creator.page.locator("textarea[name=handles]"))
    const handles = creator.page.locator("textarea[name=handles]")
    await handles.fill(one.handle)
    await acted(creator.page, () => creator.page.getByRole("button", { name: "Create group", exact: true }).click())
    assert.match(await alertText(creator.page.locator("main"), { match: /at least two/i }), /at least two/i)
    await handles.fill(`${one.handle} nobody${randomWord(6)}`)
    await acted(creator.page, () => creator.page.getByRole("button", { name: "Create group", exact: true }).click())
    assert.match(await alertText(creator.page.locator("main"), { match: /doesn.t exist/ }), /doesn.t exist/)
  })

  await check(`${where}: Create group opens the conversation with its name, and the members see it in their list`, async () => {
    groupId = await createGroupChat(creator.page, { title: name, handles: [one.handle, two.handle] })
    await creator.page.getByRole("heading", { name, exact: true }).waitFor()
    await creator.page.getByText("3 people", { exact: true }).waitFor()
    await openMessages(one.page)
    await one.page.locator("main").getByRole("link").filter({ hasText: name }).first().waitFor()
  })

  await check(`${where}: messages in a group show who wrote them and reach everyone without a reload`, async () => {
    need(groupId, "the group")
    const hello = uniq("Hello group")
    const answer = uniq("Hello back")
    await openChat(one.page, groupId)
    await openChat(two.page, groupId)
    await sendChat(creator.page, hello)
    for (const person of [one, two]) {
      await threadText(person.page, hello).waitFor()
      await person.page.locator("main").getByText(creator.name, { exact: true }).first().waitFor()
    }
    await sendChat(two.page, answer)
    await threadText(creator.page, answer).waitFor()
    await threadText(one.page, answer).waitFor()
    await one.page.locator("main").getByText(two.name, { exact: true }).first().waitFor()
  })

  await check(`${where}: when two members block each other, their messages are hidden from each other, and the rest of the group still sees them`, async () => {
    need(groupId, "the group")
    const fromOne = uniq("Before the block from one")
    const fromTwo = uniq("Before the block from two")
    const later = uniq("After the block from the creator")
    await openChat(one.page, groupId)
    await openChat(two.page, groupId)
    await sendChat(one.page, fromOne)
    await sendChat(two.page, fromTwo)
    for (const person of [creator, one, two]) {
      await threadText(person.page, fromOne).waitFor()
      await threadText(person.page, fromTwo).waitFor()
    }

    await block(one.page, two.handle)
    // Reload the thread, so what is shown comes from the server after the block, not from what was on screen before it.
    await openChat(one.page, groupId)
    await threadText(one.page, fromOne).waitFor()
    assert.equal(await threadText(one.page, fromTwo).count(), 0, "the blocked person's message still shows to the other person who blocked them")
    await openChat(two.page, groupId)
    await threadText(two.page, fromTwo).waitFor()
    assert.equal(await threadText(two.page, fromOne).count(), 0, "the blocker's message still shows to the blocked person")

    // The creator is not part of the block, so the group keeps both messages for them, and new messages reach everyone else.
    await openChat(creator.page, groupId)
    await threadText(creator.page, fromOne).waitFor()
    await threadText(creator.page, fromTwo).waitFor()
    await sendChat(creator.page, later)
    await threadText(one.page, later).waitFor()
    await threadText(two.page, later).waitFor()
  })

  await check(`${where}: Group info shows the creator's controls only to the creator`, async () => {
    need(groupId, "the group")
    await openChat(one.page, groupId)
    const member = await openGroupInfo(one.page)
    await member.getByText("Creator", { exact: true }).waitFor()
    await member.getByText(`@${one.handle} · You`).waitFor()
    assert.equal(await member.getByRole("button", { name: /^Remove @/ }).count(), 0, "a member who did not make the group is offered Remove")
    await member.getByText("Only the person who made this group can remove people from it.").waitFor()
    await closeGroupInfo(one.page)

    await openChat(creator.page, groupId)
    const owner = await openGroupInfo(creator.page)
    await owner.getByRole("button", { name: `Remove @${one.handle} from the group` }).waitFor()
    await owner.getByRole("button", { name: `Remove @${two.handle} from the group` }).waitFor()
    await owner.getByText("You made this group, so you can remove people from it.").waitFor()
    await closeGroupInfo(creator.page)
  })

  await check(`${where}: any member can rename the group and everyone sees the new name`, async () => {
    need(groupId, "the group")
    const dialog = await openGroupInfo(one.page)
    await ready(dialog.locator("#group-title"))
    await dialog.locator("#group-title").fill(renamed)
    await acted(one.page, () => dialog.getByRole("button", { name: "Save", exact: true }).click())
    await toastText(one.page, /^Group renamed/)
    await closeGroupInfo(one.page)
    await one.page.getByRole("heading", { name: renamed, exact: true }).waitFor()
    await creator.page.getByRole("heading", { name: renamed, exact: true }).waitFor()
    await openMessages(two.page)
    await two.page.locator("main").getByRole("link").filter({ hasText: renamed }).first().waitFor()
  })

  await check(`${where}: adding someone who does not follow the creator sends an invite that they accept`, async () => {
    need(groupId, "the group")
    const dialog = await openGroupInfo(creator.page)
    await ready(dialog.locator("#add-handle"))
    await dialog.locator("#add-handle").fill(invitee.handle)
    await acted(creator.page, () => dialog.getByRole("button", { name: "Add", exact: true }).click())
    await toastText(creator.page, new RegExp(`^Invited @${invitee.handle}`, "i"))
    await dialog.getByText(`@${invitee.handle} · Invited`).waitFor()
    await dialog.locator("#add-handle").fill(invitee.handle)
    await dialog.getByRole("button", { name: "Add", exact: true }).click()
    assert.match(await alertText(dialog, { match: /already in this group/ }), /already in this group/)
    await closeGroupInfo(creator.page)

    await openMessages(invitee.page, "requests")
    const row = invitee.page.locator("main").getByRole("link").filter({ hasText: renamed }).first()
    await row.waitFor()
    await row.click()
    await invitee.page.waitForURL((url) => url.pathname === `/messages/${groupId}`)
    await acted(invitee.page, () => invitee.page.getByRole("button", { name: "Accept", exact: true }).click())
    await toastText(invitee.page, /^Request accepted/)
    await chatBox(invitee.page).waitFor()
    const joined = uniq("Glad to be here")
    await sendChat(invitee.page, joined)
    await threadText(creator.page, joined).waitFor()
  })

  await check(`${where}: the creator removes a person after a question, and that person loses the group`, async () => {
    need(groupId, "the group")
    // The removed member's list still shows the group until it reloads, and Next prefetches the link. That prefetch is answered
    // 404 now that the member is out, and Chromium logs it. Nothing shows it. Allowed for this group's page during this check only.
    const endAllow = allowNoise({
      id: "prefetch-of-removed-group",
      kind: "console",
      text: /Failed to load resource: the server responded with a status of 404/,
      url: new RegExp(`^https?://[^/]+/messages/${escapeRegExp(groupId)}`),
      reason: "A removed member's list still links to the group until it reloads, so the prefetch of that page is answered 404.",
    })
    try {
      const dialog = await openGroupInfo(creator.page)
      await dialog.getByRole("button", { name: `Remove @${two.handle} from the group` }).click()
      const confirm = creator.page.getByRole("dialog", { name: `Remove ${two.name} from the group?` })
      await confirm.waitFor()
      await confirm.getByRole("button", { name: "Cancel" }).click()
      await confirm.waitFor({ state: "detached" })
      await dialog.getByText(`@${two.handle}`).waitFor()
      await dialog.getByRole("button", { name: `Remove @${two.handle} from the group` }).click()
      await confirm.waitFor()
      await acted(creator.page, () => confirm.getByRole("button", { name: "Remove", exact: true }).click())
      await toastText(creator.page, new RegExp(`^Removed @${two.handle} from the group`, "i"))
      await dialog.getByText(`@${two.handle}`).waitFor({ state: "detached" })
      await closeGroupInfo(creator.page)

      const removedAnswer = await notHere(two.page, `/messages/${groupId}`)
      const unknownAnswer = await notHere(two.page, `/messages/${missingId()}`)
      assert.equal(removedAnswer, unknownAnswer, "a removed member gets a different answer from a group that does not exist")
      await openMessages(two.page)
      assert.equal(await two.page.locator("main").getByRole("link").filter({ hasText: renamed }).count(), 0, "a removed member still has the group in the list")
    } finally {
      endAllow()
    }
  })

  await check(`${where}: Leave group asks first, sends the person back to Messages, and the others see them gone`, async () => {
    need(groupId, "the group")
    await openChat(one.page, groupId)
    const dialog = await openGroupInfo(one.page)
    await dialog.getByRole("button", { name: "Leave group" }).click()
    const confirm = one.page.getByRole("dialog", { name: "Leave this group?" })
    await confirm.waitFor()
    await confirm.getByRole("button", { name: "Cancel" }).click()
    await confirm.waitFor({ state: "detached" })
    await dialog.getByRole("button", { name: "Leave group" }).click()
    await confirm.waitFor()
    await acted(one.page, () => confirm.getByRole("button", { name: "Leave group" }).click())
    await toastText(one.page, /^You left the group/)
    await one.page.waitForURL((url) => url.pathname === "/messages")
    assert.equal(await one.page.locator("main").getByRole("link").filter({ hasText: renamed }).count(), 0, "a group that was left is still in the list")

    await openChat(creator.page, groupId)
    const info = await openGroupInfo(creator.page)
    assert.equal(await info.getByText(`@${one.handle}`).count(), 0, "a member who left is still listed")
    await closeGroupInfo(creator.page)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Declining, and who can be messaged
// ---------------------------------------------------------------------------------------------------------------------

async function requestsFlow() {
  const asker = await createUser({ tag: "rqa" })
  const target = await createUser({ tag: "rqt" })
  const blocker = await createUser({ tag: "rqb" })
  const note = uniq("Hello from a stranger")
  let convId = null

  await check("messages: New message starts a chat from a handle, and the other person sees a request", async () => {
    await go(asker.page, "/messages/new", asker.page.locator("#chat-handle"))
    await asker.page.locator("#chat-handle").fill(`@${target.handle}`)
    await acted(asker.page, () => asker.page.getByRole("button", { name: "Next", exact: true }).click())
    convId = await waitForConversation(asker.page)
    // The bubble shows before the server saves the message, so wait for the save before the other person looks.
    // Typing also posts to this conversation, so the wait is for the send itself: the POST that carries the note.
    // In an encrypted chat the request carries sealed text, not the words, so the wait is for the row the server saves.
    const saved = ENCRYPTED
      ? savedInChat(convId, asker.handle)
      : asker.page.waitForResponse(
          (r) => r.request().method() === "POST" && r.url().includes(`/messages/${convId}`) && (r.request().postData() ?? "").includes(note),
          { timeout: TIMEOUT }
        )
    saved.catch(() => {})
    await sendChat(asker.page, note)
    await saved
    await openMessages(target.page, "requests")
    await target.page.locator("main").getByRole("link").filter({ hasText: asker.name }).filter({ hasText: previewOf(note) }).first().waitFor()
  })

  await check("messages: Decline removes the request for the receiver and the sender keeps the thread", async () => {
    need(convId, "the conversation")
    await openChat(target.page, convId)
    await acted(target.page, () => target.page.getByRole("button", { name: "Decline", exact: true }).click())
    await toastText(target.page, /^Request declined/)
    await target.page.waitForURL((url) => url.pathname === "/messages" && url.searchParams.get("tab") === "requests")
    await target.page.getByText("No message requests").waitFor()
    await openMessages(asker.page)
    await asker.page.locator("main").getByRole("link").filter({ hasText: target.name }).filter({ hasText: previewOf(note) }).first().waitFor()
  })

  await check("messages: the New message form refuses unknown handles, yourself, and anyone who blocked you", async () => {
    await go(asker.page, "/messages/new", asker.page.locator("#chat-handle"))
    const field = asker.page.locator("#chat-handle")
    const next = asker.page.getByRole("button", { name: "Next", exact: true })
    await field.fill(`nobody${randomWord(8)}`)
    await next.click()
    assert.match(await alertText(asker.page.locator("main"), { match: /doesn.t exist/ }), /doesn.t exist/)
    await field.fill(asker.handle)
    await next.click()
    assert.match(await alertText(asker.page.locator("main"), { match: /yourself/ }), /yourself/)

    await block(blocker.page, asker.handle)
    await field.fill(blocker.handle)
    await next.click()
    assert.match(await alertText(asker.page.locator("main"), { match: /can.t message this account/ }), /can.t message this account/)
  })

  await check("messages: the pages of Messages fit the screen with no conversations, with requests, and as a signed-in newcomer", async () => {
    const newcomer = await createUser({ tag: "rqn", phone: true })
    await openMessages(newcomer.page)
    await newcomer.page.getByText("No conversations yet").waitFor()
    await openMessages(newcomer.page, "requests")
    await newcomer.page.getByText("No message requests").waitFor()
    await go(newcomer.page, "/messages/new", newcomer.page.locator("#chat-handle"))
    assert.match(await bodyText(newcomer.page), /Start a group/)
  })
}
