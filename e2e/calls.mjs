// Voice calls, one to one and in groups, on a computer and on a phone. Every browser has a fake microphone, so calls
// really connect: the checks read the audio statistics of the page's peer connections to see sound moving both ways.
import { area, assert, check, guard, need, note } from "./lib/harness.mjs"
import { RUN_ID, randomWord, sleep } from "./lib/env.mjs"
import { createUser, signInElsewhere } from "./lib/accounts.mjs"
import { newTab } from "./lib/browser.mjs"
import {
  answerButton,
  anyCards,
  audioState,
  callButton,
  control,
  dmCard,
  dmCards,
  fillsScreen,
  groupCard,
  micFlags,
  recordsInThread,
  recordsReach,
  secondsOn,
  sitsInCorner,
  soundBothWays,
  tileOf,
  tiles,
  tilesReach,
  tilesSettled,
  timerRunning,
} from "./lib/call.mjs"
import { createGroupChat, openChat, waitForConversation } from "./lib/chat.mjs"
import { bannerWith, expectBanner, idleOnSettings } from "./lib/live.mjs"
import { follow } from "./lib/people.mjs"
import { openHome, openProfile } from "./lib/posts.mjs"
import { toastText } from "./lib/ui.mjs"

// How the thread words a finished call.
const VOICE = /^Voice call · \d+:\d\d$/
const ENDED_NOTE = /^Call ended · \d+:\d\d$/

export async function run() {
  area("calls")
  await guard("voice calls on a computer", () => dmFlow({ phone: false }))
  await guard("voice calls on a phone", () => dmFlow({ phone: true }))
  await guard("group calls on a computer", () => groupFlow({ phone: false }))
  await guard("group calls on a phone", () => groupFlow({ phone: true }))
}

// ---------------------------------------------------------------------------------------------------------------------
// One to one
// ---------------------------------------------------------------------------------------------------------------------

// A chat that is accepted on both sides from the start: the person called follows the caller first, so the caller's
// first message is not a request. Returns the conversation id, with the caller on the chat page.
async function acceptedChat(caller, callee) {
  await follow(callee.page, caller.handle)
  await openProfile(caller.page, callee.handle)
  await caller.page.getByRole("button", { name: "Message", exact: true }).click()
  return waitForConversation(caller.page)
}

// The caller presses the call button in the open chat. Returns both cards once both are on screen.
async function ring(caller, callee) {
  const outgoing = dmCard(caller.page, callee.name)
  const incoming = dmCard(callee.page, caller.name)
  await callButton(caller.page, callee.name).click()
  await outgoing.waitFor()
  await incoming.waitFor()
  return { outgoing, incoming }
}

// Rings, answers from the card, and waits until both clocks run.
async function connect(caller, callee) {
  const cards = await ring(caller, callee)
  await control(cards.incoming, "Accept").click()
  await timerRunning(cards.outgoing)
  await timerRunning(cards.incoming)
  return cards
}

// Whether every connection of a page sends (or, with false, holds back) the microphone.
function sending(flags, wanted = true) {
  return flags.length > 0 && flags.every((flag) => flag === wanted)
}

async function bothGone(...pages) {
  for (const page of pages) assert.equal(await anyCards(page).count(), 0, "a call card is still on the page after the call ended")
}

async function dmFlow({ phone }) {
  const where = phone ? "phone" : "computer"
  const caller = await createUser({ tag: phone ? "clp" : "cld", phone, mic: true })
  const callee = await createUser({ tag: phone ? "cep" : "ced", phone, mic: true })
  const convId = await acceptedChat(caller, callee)
  // How many lines of each wording the threads should hold by now. A line left by an earlier call never stands in for a later one.
  const lines = { voice: 0, declined: 0, youDeclined: 0, noAnswer: 0, missed: 0 }
  // The call the first check leaves running for the next two.
  let talking = null

  await check(`${where}: calls can run in this browser: a secure page, and a microphone that opens`, async () => {
    const result = await caller.page.evaluate(async () => {
      if (!window.isSecureContext) return "the page is not a secure context, and browsers refuse microphones there"
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const tracks = stream.getAudioTracks().length
        stream.getTracks().forEach((track) => track.stop())
        return tracks > 0 ? "ok" : "the microphone gave no audio track"
      } catch (error) {
        return `the microphone did not open: ${error && error.name}`
      }
    })
    assert.equal(result, "ok", `${result}. Run the suite against http://localhost or https so calls can start`)
  })

  await check(`${where}: calling rings the other person, answering connects them, and sound runs both ways`, async () => {
    await idleOnSettings(callee.page)
    const { outgoing, incoming } = await ring(caller, callee)
    await outgoing.getByText("Calling…").waitFor()
    await control(outgoing, "Cancel").waitFor()
    await control(outgoing, "Mute").waitFor()
    await incoming.getByText("Incoming voice call").waitFor()
    await control(incoming, "Decline").waitFor()
    await control(incoming, "Accept").click()
    await timerRunning(outgoing)
    await timerRunning(incoming)
    talking = { outgoing, incoming }
    const first = await secondsOn(incoming)
    await soundBothWays([
      { page: caller.page, peers: 1 },
      { page: callee.page, peers: 1 },
    ])
    await sleep(2300)
    assert.ok((await secondsOn(incoming)) > first, "the clock on the call does not move")
    if (phone) {
      await fillsScreen(caller.page, outgoing)
      await fillsScreen(callee.page, incoming)
    } else {
      await sitsInCorner(caller.page, outgoing)
      await sitsInCorner(callee.page, incoming)
    }
  })

  await check(`${where}: Mute stops this side's microphone and no one else's, and Unmute brings it back`, async () => {
    const { outgoing, incoming } = need(talking, "the connected call")
    assert.ok(sending(await micFlags(callee.page)), "the microphone is not sending when the call connects")
    await control(incoming, "Mute").click()
    const unmute = control(incoming, "Unmute")
    await unmute.waitFor()
    assert.equal(await unmute.getAttribute("aria-pressed"), "true", "the Unmute button does not say it is pressed")
    assert.ok(sending(await micFlags(callee.page), false), "muting did not stop the microphone")
    assert.ok(sending(await micFlags(caller.page)), "muting on one side silenced the other side")
    await control(outgoing, "Mute").waitFor()
    await unmute.click()
    await control(incoming, "Mute").waitFor()
    assert.ok(sending(await micFlags(callee.page)), "unmuting did not bring the microphone back")
  })

  await check(`${where}: End closes both cards, tells the other side, and leaves a record in both threads`, async () => {
    const { outgoing, incoming } = need(talking, "the connected call")
    talking = null
    await control(outgoing, "End").click()
    await incoming.getByText(ENDED_NOTE).waitFor({ timeout: 10_000 })
    await outgoing.waitFor({ state: "detached" })
    await incoming.waitFor({ state: "detached" })
    await bothGone(caller.page, callee.page)
    assert.equal((await audioState(caller.page)).peers, 0, "the caller's page still holds a connection after the call")
    assert.equal((await audioState(callee.page)).peers, 0, "the callee's page still holds a connection after the call")
    lines.voice += 1
    await recordsReach(caller.page, VOICE, lines.voice)
    await recordsInThread(callee.page, convId, VOICE, lines.voice)
  })

  await check(`${where}: Decline tells the caller, and the two threads word it for each side`, async () => {
    await idleOnSettings(callee.page)
    await openChat(caller.page, convId)
    const { outgoing, incoming } = await ring(caller, callee)
    await control(incoming, "Decline").click()
    await outgoing.getByText("Declined").waitFor()
    await outgoing.waitFor({ state: "detached" })
    await incoming.waitFor({ state: "detached" })
    await bothGone(caller.page, callee.page)
    lines.declined += 1
    lines.youDeclined += 1
    await recordsReach(caller.page, "Declined", lines.declined)
    await recordsInThread(callee.page, convId, "You declined", lines.youDeclined)
  })

  await check(`${where}: Cancel stops the ring on the other side, and they get a missed call banner`, async () => {
    await idleOnSettings(callee.page)
    await openChat(caller.page, convId)
    const banner = expectBanner(callee.page, "Missed call", 15_000)
    const { outgoing, incoming } = await ring(caller, callee)
    await control(outgoing, "Cancel").click()
    await incoming.waitFor({ state: "detached" })
    await outgoing.waitFor({ state: "detached" })
    assert.equal(await banner, true, "the person who was rung got no missed call banner")
    lines.noAnswer += 1
    lines.missed += 1
    await recordsReach(caller.page, "No answer", lines.noAnswer)
    await recordsInThread(callee.page, convId, "Missed call", lines.missed)
  })

  if (phone) return

  await check("computer: with the chat open, the call button turns into Answer and picks the call up", async () => {
    await openChat(callee.page, convId)
    await openChat(caller.page, convId)
    const outgoing = dmCard(caller.page, callee.name)
    const incoming = dmCard(callee.page, caller.name)
    await callButton(caller.page, callee.name).click()
    await incoming.waitFor()
    const answer = answerButton(callee.page, caller.name)
    await answer.waitFor()
    await answer.click()
    await timerRunning(outgoing)
    await timerRunning(incoming)
    await answerButton(callee.page, caller.name).waitFor({ state: "detached" })
    await soundBothWays([
      { page: caller.page, peers: 1 },
      { page: callee.page, peers: 1 },
    ])
    await control(incoming, "End").click()
    await outgoing.getByText(ENDED_NOTE).waitFor({ timeout: 10_000 })
    await outgoing.waitFor({ state: "detached" })
    await incoming.waitFor({ state: "detached" })
    lines.voice += 1
    await recordsReach(callee.page, VOICE, lines.voice)
    await recordsReach(caller.page, VOICE, lines.voice)
  })

  await check("computer: someone with no page open cannot be rung: the caller hears so at once, and the missed call waits for them", async () => {
    await callee.page.goto("about:blank")
    // The server drops the event stream of a closed page a moment later.
    await sleep(1500)
    await openChat(caller.page, convId)
    await callButton(caller.page, callee.name).click()
    await dmCard(caller.page, callee.name).getByText(`${callee.name} isn't available right now.`).waitFor()
    await dmCards(caller.page, callee.name).first().waitFor({ state: "detached" })
    lines.noAnswer += 1
    lines.missed += 1
    await recordsReach(caller.page, "No answer", lines.noAnswer)
    await openHome(callee.page)
    await bannerWith(callee.page, "Missed call").waitFor({ timeout: 12_000 })
    await recordsInThread(callee.page, convId, "Missed call", lines.missed)
  })

  await check("computer: a ring nobody answers gives up by itself: No answer for the caller, a missed call for the other", async () => {
    await idleOnSettings(callee.page)
    await openChat(caller.page, convId)
    const banner = expectBanner(callee.page, "Missed call", 60_000)
    const { outgoing, incoming } = await ring(caller, callee)
    note("waiting for the ring to run out (about 35 seconds)")
    await outgoing.getByText("No answer").waitFor({ timeout: 60_000 })
    await incoming.waitFor({ state: "detached" })
    assert.equal(await banner, true, "the person who was rung got no missed call banner when the ring ran out")
    lines.noAnswer += 1
    lines.missed += 1
    await recordsReach(caller.page, "No answer", lines.noAnswer)
    await recordsInThread(callee.page, convId, "Missed call", lines.missed)
  })

  await check("computer: closing the tab during a call ends it for the other person within seconds", async () => {
    await idleOnSettings(callee.page)
    await openChat(caller.page, convId)
    const { outgoing } = await connect(caller, callee)
    await callee.page.goto("about:blank")
    await outgoing.getByText(ENDED_NOTE).waitFor({ timeout: 15_000 })
    await outgoing.waitFor({ state: "detached" })
    lines.voice += 1
    await recordsReach(caller.page, VOICE, lines.voice)
  })

  await check("computer: a call rings every device; answering on the phone stops the computer ringing and fills the phone's screen", async () => {
    const onPhone = await signInElsewhere(callee, { phone: true, mic: true, label: `${callee.tag}-phone` })
    await idleOnSettings(callee.page)
    await idleOnSettings(onPhone.page)
    await openChat(caller.page, convId)
    const outgoing = dmCard(caller.page, callee.name)
    const ringingHere = dmCard(callee.page, caller.name)
    const ringingThere = dmCard(onPhone.page, caller.name)
    await callButton(caller.page, callee.name).click()
    await outgoing.waitFor()
    await ringingHere.waitFor()
    await ringingThere.waitFor()
    await control(ringingThere, "Accept").click()
    await ringingHere.waitFor({ state: "detached" })
    await timerRunning(ringingThere)
    await timerRunning(outgoing)
    await fillsScreen(onPhone.page, ringingThere)
    await soundBothWays([
      { page: caller.page, peers: 1 },
      { page: onPhone.page, peers: 1 },
    ])
    assert.equal(await anyCards(callee.page).count(), 0, "the computer shows a call after the phone answered it")
    await control(ringingThere, "End").click()
    await outgoing.waitFor({ state: "detached" })
    await ringingThere.waitFor({ state: "detached" })
    lines.voice += 1
    await recordsReach(caller.page, VOICE, lines.voice)
  })

  await check("computer: when one browser has two tabs open, only one of them rings", async () => {
    const second = await newTab(callee, `${callee.tag}-second-tab`)
    await idleOnSettings(callee.page)
    await idleOnSettings(second)
    await openChat(caller.page, convId)
    const outgoing = dmCard(caller.page, callee.name)
    await callButton(caller.page, callee.name).click()
    await outgoing.waitFor()
    const ringing = async () => (await dmCards(callee.page, caller.name).count()) + (await dmCards(second, caller.name).count())
    const until = Date.now() + 12_000
    while ((await ringing()) === 0 && Date.now() < until) await sleep(200)
    // Both tabs heard the ring and agree between themselves which one answers it.
    await sleep(1500)
    assert.equal(await ringing(), 1, "the ring should show in exactly one of the two tabs")
    await control(outgoing, "Cancel").click()
    await outgoing.waitFor({ state: "detached" })
    await second.close()
  })

  await check("computer: a chat the other person has not accepted yet cannot be called, and the caller is told why", async () => {
    const stranger = await createUser({ tag: "cst" })
    await openProfile(caller.page, stranger.handle)
    await caller.page.getByRole("button", { name: "Message", exact: true }).click()
    await caller.page.waitForURL((url) => /^\/messages\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith(convId))
    await callButton(caller.page, stranger.name).click()
    await toastText(caller.page, /You can call once they accept your message/)
    await bothGone(caller.page)
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------------------------------------------------

async function groupFlow({ phone }) {
  const where = phone ? "phone" : "computer"
  const mark = phone ? "p" : "d"
  const starter = await createUser({ tag: `gs${mark}`, phone, mic: true })
  const one = await createUser({ tag: `g1${mark}`, phone, mic: true })
  const two = await createUser({ tag: `g2${mark}`, phone, mic: true })
  // The late joiner only exists on a computer: it opens the app while the call is already going.
  const late = phone ? null : await createUser({ tag: `gl${mark}`, phone, mic: true })
  const members = late ? [one, two, late] : [one, two]
  // People who follow the starter are in the group at once. Anyone else would have to accept an invitation first.
  for (const member of members) await follow(member.page, starter.handle)
  const title = `Call group ${RUN_ID}${randomWord(4)}`
  const groupId = await createGroupChat(starter.page, { title, handles: members.map((member) => member.handle) })
  // On a phone both members answer; on a computer one answers and one turns the ring down.
  const answering = phone ? [one, two] : [one]
  const everyone = [starter, ...answering]
  const starterCard = () => groupCard(starter.page, title)

  await check(`${where}: Start a group call rings the other members, and every card is named after the group`, async () => {
    await idleOnSettings(one.page)
    await idleOnSettings(two.page)
    if (late) {
      // A page that is not open cannot be rung. This one opens later and finds the call going.
      await late.page.goto("about:blank")
      await sleep(1500)
    }
    await openChat(starter.page, groupId)
    await starter.page.getByRole("button", { name: "Start a group call", exact: true }).click()
    const mine = starterCard()
    await mine.waitFor()
    await mine.getByText("Calling everyone…").waitFor()
    await control(mine, "Mute").waitFor()
    await control(mine, "Leave").waitFor()
    for (const member of [one, two]) {
      const ringing = groupCard(member.page, title)
      await ringing.waitFor()
      await ringing.getByText(`Group call from ${starter.name}`).waitFor()
      await control(ringing, "Decline").waitFor()
      await control(ringing, "Accept").waitFor()
    }
  })

  await check(`${where}: answering joins the call: everyone sees everyone, the clock runs, and sound runs between all of them`, async () => {
    need((await starterCard().count()) > 0, "the call that Start a group call began")
    if (!phone) {
      // The ring only lasts about half a minute, so the person turning it down does it first.
      const turned = groupCard(two.page, title)
      await control(turned, "Decline").click()
      await turned.waitFor({ state: "detached" })
    }
    for (const member of answering) await control(groupCard(member.page, title), "Accept").click()
    await timerRunning(starterCard())
    for (const member of answering) await timerRunning(groupCard(member.page, title))
    await tilesReach(starterCard(), everyone.length)
    for (const member of answering) {
      await tileOf(starterCard(), member.name).first().waitFor()
      await tilesReach(groupCard(member.page, title), everyone.length)
      await tileOf(groupCard(member.page, title), starter.name).first().waitFor()
    }
    assert.match(await tiles(starterCard()).first().innerText(), /You/, "the first tile is not yours")
    await tilesSettled(starterCard())
    await soundBothWays(everyone.map((person) => ({ page: person.page, peers: everyone.length - 1 })))
    if (phone) {
      for (const person of everyone) await fillsScreen(person.page, groupCard(person.page, title))
      const width = starter.page.viewportSize().width
      for (const tile of await tiles(starterCard()).all()) {
        const box = await tile.boundingBox()
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, "a tile of the call sticks out of the phone screen")
      }
    } else {
      await sitsInCorner(starter.page, starterCard())
    }
  })

  if (!phone) {
    await check("computer: a group ring that was turned down is gone, the call goes on without that person, and no Join banner chases them", async () => {
      await bothGone(two.page)
      await tilesReach(starterCard(), 2)
      await sleep(1500)
      assert.equal(await bannerWith(two.page, "Group call").count(), 0, "a Join banner shows for a call the person just turned down")
    })

    await check("computer: someone who opens the app during the call gets a Join banner, and Join puts them in it", async () => {
      await openHome(late.page)
      const banner = late.page.locator('[aria-live="polite"] button').filter({ hasText: title }).filter({ hasText: "Group call · 2 people" }).first()
      await banner.waitFor({ timeout: 15_000 })
      await late.page.getByRole("button", { name: "Join", exact: true }).click()
      const joined = groupCard(late.page, title)
      await joined.waitFor()
      await timerRunning(joined)
      await tilesReach(joined, 3)
      await tilesReach(starterCard(), 3)
      await tilesSettled(starterCard())
      await soundBothWays([starter, one, late].map((person) => ({ page: person.page, peers: 2 })))
      await banner.waitFor({ state: "detached" })
    })

    await check("computer: in the group's own page the call button turns into Join with the head count, and joins the call", async () => {
      await openChat(two.page, groupId)
      const join = two.page.getByRole("button", { name: "Join the group call, 3 people in it", exact: true })
      await join.waitFor()
      await join.click()
      const joined = groupCard(two.page, title)
      await joined.waitFor()
      await timerRunning(joined)
      await tilesReach(joined, 4)
      await tilesReach(starterCard(), 4)
      await two.page.getByRole("button", { name: "On this call", exact: true }).waitFor()
      await soundBothWays([starter, one, late, two].map((person) => ({ page: person.page, peers: 3 })))
    })
  }

  await check(`${where}: Mute silences your own microphone only, and your tile says Muted`, async () => {
    const card = starterCard()
    const before = await micFlags(starter.page)
    assert.ok(sending(before), "the microphone is not sending while the call is going")
    await control(card, "Mute").click()
    await control(card, "Unmute").waitFor()
    await tiles(card).first().getByText("Muted").waitFor()
    const muted = await micFlags(starter.page)
    assert.ok(muted.length === before.length && sending(muted, false), "muting did not stop the microphone on every connection")
    assert.ok(sending(await micFlags(one.page)), "muting one person silenced another")
    await control(card, "Unmute").click()
    await control(card, "Mute").waitFor()
    await tiles(card).first().getByText("Muted").waitFor({ state: "detached" })
    assert.ok(sending(await micFlags(starter.page)), "unmuting did not bring the microphone back")
  })

  await check(`${where}: Leave takes one person out: their tile goes from the others' cards and the call goes on`, async () => {
    const card = groupCard(one.page, title)
    const before = await tiles(starterCard()).count()
    await control(card, "Leave").click()
    await card.getByText("You left the call.").waitFor()
    await card.waitFor({ state: "detached" })
    await tilesReach(starterCard(), before - 1)
    assert.equal(await tileOf(starterCard(), one.name).count(), 0, "the person who left still has a tile")
    assert.equal(await starterCard().count(), 1, "the call ended for the people who stayed")
  })

  await check(`${where}: when the last person leaves the call ends, and the group thread keeps one record of it`, async () => {
    // The starter leaves first, so the call has to outlive the person who began it.
    const order = late ? [starter, late, two] : [starter, two]
    for (const person of order) {
      const card = groupCard(person.page, title)
      await card.waitFor()
      await control(card, "Leave").click()
      await card.waitFor({ state: "detached" })
      if (person === starter && late) {
        // Back in the group page, the call button offers to rejoin, with the people still in it counted.
        await starter.page.getByRole("button", { name: "Join the group call, 2 people in it", exact: true }).waitFor()
      }
    }
    // Everyone who took part counts, including the person who left early.
    const people = late ? 4 : 3
    const wording = new RegExp(`^Group call · ${people} people · \\d+:\\d\\d$`)
    await openChat(starter.page, groupId)
    await recordsReach(starter.page, wording, 1)
    await starter.page.getByRole("button", { name: "Start a group call", exact: true }).waitFor()
    await recordsInThread(one.page, groupId, wording, 1)
    await bothGone(starter.page, one.page, two.page)
  })
}
