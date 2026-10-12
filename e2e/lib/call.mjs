// Voice calls: the call card (or the full screen on a phone), its buttons, and how the audio is doing underneath.
import assert from "node:assert/strict"
import { sleep } from "./env.mjs"
import { openChat } from "./chat.mjs"

// The call as one person sees it. A one-to-one call is named after the other person, a group call after the group.
// `.first()` keeps a card that is still fading out from clashing with the next one.
export function dmCards(page, name) {
  return page.locator(`section[aria-label=${JSON.stringify(`Voice call with ${name}`)}]`)
}

// A video call is named the same way, with "Video" in place of "Voice".
export function videoCard(page, name) {
  return page.locator(`section[aria-label=${JSON.stringify(`Video call with ${name}`)}]`).first()
}

export function groupCards(page, title) {
  return page.locator(`section[aria-label=${JSON.stringify(`Group call in ${title}`)}]`)
}

export function dmCard(page, name) {
  return dmCards(page, name).first()
}

export function groupCard(page, title) {
  return groupCards(page, title).first()
}

// Every call card on the page, whichever kind.
export function anyCards(page) {
  return page.locator('section[aria-label^="Voice call with"], section[aria-label^="Video call with"], section[aria-label^="Group call"]')
}

// The round buttons of a card: Accept, Decline, Mute, Unmute, Cancel, End, Leave.
export function control(card, label) {
  return card.getByRole("button", { name: label, exact: true })
}

// The call button in a conversation's header. It reads "Answer ..." while that person is ringing.
// The video call button in a conversation's header.
export function videoCallButton(page, name) {
  return page.getByRole("button", { name: `Video call ${name}`, exact: true })
}

// Waits until the other person's picture is playing on this page: the video element has a frame to show.
export async function pictureReady(page, timeout = 25_000) {
  await page.waitForFunction(
    () => {
      const remote = document.querySelector('video[aria-label^="Video of"]')
      return Boolean(remote && remote.videoWidth > 0 && remote.readyState >= 2)
    },
    null,
    { timeout }
  )
}

export function callButton(page, name) {
  return page.getByRole("button", { name: `Call ${name}`, exact: true })
}

export function answerButton(page, name) {
  return page.getByRole("button", { name: `Answer ${name}`, exact: true })
}

// Waits for the clock a connected call counts. Connecting takes a few seconds, and gets 25 seconds in the app.
export async function timerRunning(card, timeout = 35_000) {
  await card.getByText(/^\d+:\d\d$/).waitFor({ timeout })
}

// The seconds the clock shows right now.
export async function secondsOn(card) {
  const text = (await card.getByText(/^\d+:\d\d$/).first().innerText()).trim()
  const [minutes, seconds] = text.split(":").map(Number)
  return minutes * 60 + seconds
}

// The people in a group call card: you first, then one tile for each person.
export function tiles(card) {
  return card.getByRole("list", { name: "People in the call" }).getByRole("listitem")
}

export function tileOf(card, name) {
  return tiles(card).filter({ hasText: name })
}

// Waits until the card shows exactly `count` tiles.
export async function tilesReach(card, count, timeout = 25_000) {
  const end = Date.now() + timeout
  let seen = -1
  while (Date.now() < end) {
    seen = await tiles(card).count()
    if (seen === count) return
    await sleep(250)
  }
  throw new Error(`the call shows ${seen} people, expected ${count}`)
}

// Waits until no tile of the card says it is still connecting, reconnecting or has failed.
export async function tilesSettled(card, timeout = 30_000) {
  const end = Date.now() + timeout
  let text = ""
  while (Date.now() < end) {
    text = (await card.getByRole("list", { name: "People in the call" }).innerText().catch(() => "")).replace(/\s+/g, " ")
    if (text && !/Connecting…|Reconnecting…|Couldn't connect/.test(text)) return
    await sleep(300)
  }
  throw new Error(`some people in the call never finished connecting: ${text}`)
}

// How the peer connections of this page are doing. Closed ones are left out.
export function audioState(page) {
  return page.evaluate(async () => {
    const state = { peers: 0, connected: 0, sent: 0, received: 0, enabled: [] }
    for (const peer of window.__rhenkoPeers ?? []) {
      if (peer.connectionState === "closed") continue
      state.peers += 1
      if (peer.connectionState === "connected") state.connected += 1
      for (const sender of peer.getSenders()) {
        if (sender.track && sender.track.kind === "audio") state.enabled.push(sender.track.enabled)
      }
      const reports = await peer.getStats()
      reports.forEach((report) => {
        const kind = report.kind ?? report.mediaType
        if (kind !== "audio") return
        if (report.type === "outbound-rtp") state.sent += report.bytesSent ?? 0
        if (report.type === "inbound-rtp") state.received += report.bytesReceived ?? 0
      })
    }
    return state
  })
}

// Whether the microphone track is sending on each connection of this page: one flag for each connection.
export async function micFlags(page) {
  return (await audioState(page)).enabled
}

// Waits until every person has the wanted number of connected peers and audio is moving in both directions on each:
// more bytes sent and more bytes received than a moment ago. `people` is a list of { page, peers }.
export async function soundBothWays(people, { timeout = 25_000 } = {}) {
  const before = await Promise.all(people.map(({ page }) => audioState(page)))
  const end = Date.now() + timeout
  let latest = before
  while (Date.now() < end) {
    await sleep(700)
    latest = await Promise.all(people.map(({ page }) => audioState(page)))
    const moving = latest.every(
      (now, index) => now.connected >= people[index].peers && now.sent > before[index].sent && now.received > before[index].received
    )
    if (moving) return latest
  }
  const report = latest.map((now, index) => `person ${index + 1}: ${now.connected}/${people[index].peers} connected, sent ${now.sent - before[index].sent}, received ${now.received - before[index].received}`)
  throw new Error(`sound is not moving both ways (${report.join("; ")})`)
}

// The call records a thread holds: the centred lines that say how a call went. A string matches the whole line.
export function recordLines(page, wording) {
  return page.locator("main").getByText(wording, { exact: typeof wording === "string" })
}

// Waits until the open thread holds at least `atLeast` lines with this wording.
export async function recordsReach(page, wording, atLeast, timeout = 20_000) {
  const lines = recordLines(page, wording)
  const end = Date.now() + timeout
  let seen = 0
  while (Date.now() < end) {
    seen = await lines.count()
    if (seen >= atLeast) return seen
    await sleep(250)
  }
  throw new Error(`the thread shows ${seen} "${wording}" lines, expected at least ${atLeast}`)
}

// Opens the thread of a conversation and waits for the records to reach the count.
export async function recordsInThread(page, conversationId, wording, atLeast) {
  await openChat(page, conversationId)
  return recordsReach(page, wording, atLeast)
}

// On a phone the call takes the whole screen. The card must cover the viewport and keep its buttons on screen.
export async function fillsScreen(page, card) {
  const view = page.viewportSize()
  const box = await card.boundingBox()
  assert.ok(box, "the call card has no size")
  assert.ok(box.x <= 1 && box.y <= 1, `the call does not start at the corner of the screen (${Math.round(box.x)}, ${Math.round(box.y)})`)
  assert.ok(box.width >= view.width - 2 && box.height >= view.height - 2, `the call does not fill the screen: ${Math.round(box.width)}x${Math.round(box.height)} on ${view.width}x${view.height}`)
  for (const button of await card.getByRole("button").all()) {
    const rect = await button.boundingBox()
    assert.ok(rect, "a call button has no size")
    assert.ok(rect.x >= 0 && rect.x + rect.width <= view.width + 1 && rect.y >= 0 && rect.y + rect.height <= view.height + 1, "a call button sits outside the screen")
  }
}

// On a computer the call is a small card in the bottom right corner, and the page behind it stays usable.
export async function sitsInCorner(page, card) {
  const view = page.viewportSize()
  const box = await card.boundingBox()
  assert.ok(box, "the call card has no size")
  assert.ok(box.width <= 420, `the call card is ${Math.round(box.width)} px wide, more than a corner card should be`)
  assert.ok(box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1, "the call card sticks out of the window")
  assert.ok(box.x + box.width >= view.width - 60 && box.y + box.height >= view.height - 60, "the call card is not in the lower right corner")
}
