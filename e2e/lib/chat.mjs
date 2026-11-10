// Direct messages and group chats: the conversation page, its composer, reactions, and the group panel.
import { escapeRegExp } from "./env.mjs"
import { acted, go, ready, streamOpen, toastText } from "./ui.mjs"

export function chatBox(page) {
  return page.getByRole("textbox", { name: "Message", exact: true })
}

// Opens a conversation by id and waits for the button every conversation has in its header, and for the live stream
// that brings new messages and calls to the open page.
export async function openChat(page, id) {
  // The options button is in the header on every screen; the mute button is there on a computer only.
  await go(page, `/messages/${id}`, page.getByRole("button", { name: "Chat options" }))
  await streamOpen(page)
}

// The id of the conversation the page is on. "/messages/new" is the form for starting one, not a conversation.
export function chatIdOf(page) {
  const match = /^\/messages\/(?!new$)([^/?#]+)$/.exec(new URL(page.url()).pathname)
  if (!match) throw new Error(`not on a conversation page: ${page.url()}`)
  return match[1]
}

// Waits until the page has moved on to a conversation (never the new-conversation form, which the page starts on), and
// returns its id.
export async function waitForConversation(page) {
  await page.waitForURL((url) => /^\/messages\/(?!new$)[^/]+$/.test(url.pathname))
  return chatIdOf(page)
}

// The text of a message in the thread.
export function threadText(page, text) {
  return page.locator("main").getByText(text).first()
}

// Types a message and sends it with Enter. Resolves once the message shows in the thread.
export async function sendChat(page, text) {
  const box = chatBox(page)
  await ready(box)
  await box.fill(text)
  await acted(page, () => box.press("Enter"))
  await threadText(page, text).waitFor()
}

// The whole row of one message: its bubble and the reactions under it.
export function messageRow(page, text) {
  return page.locator("main div.group").filter({ hasText: text }).last()
}

// Opens the actions of a message by holding its bubble down, as a press does on a phone: the reactions, Reply, the menu and Delete
// come up together. The hold stays until the sheet is on screen, then lets go, so the sheet stays open.
export async function holdRow(page, row, text = null) {
  const bubble = row.locator('[tabindex="0"]').first()
  await bubble.waitFor()
  // A page that has just loaded takes its presses only once React is in charge of it.
  await ready(bubble)
  // Notes what is on the page before the press: an action sheet still open from an earlier step, and the row this hold would hit.
  const before = await page.evaluate(() => {
    const backdrop = document.querySelector("div.fixed.inset-0.z-40")
    if (!backdrop) return null
    const sheet = document.querySelector("div.fixed.z-50.flex.flex-col")
    return {
      sheet: sheet ? `${sheet.style.top}|${sheet.style.left}|${sheet.style.right} ${sheet.textContent.slice(0, 120)}` : null,
      bubbles: [...document.querySelectorAll('main [tabindex="0"]')].map((el) => {
        const r = el.getBoundingClientRect()
        return `${Math.round(r.top)}..${Math.round(r.bottom)} x${Math.round(r.left)} ${el.textContent.slice(0, 36)}`
      }),
    }
  })
  const rowTabbable = await row.evaluate((el) => ({
    id: el.getAttribute("data-message-id"),
    text: el.textContent.slice(0, 80),
    tabbable: [...el.querySelectorAll('[tabindex="0"]')].map((node) => node.textContent.slice(0, 30)),
  }))
  // Which message rows hold the text this hold was asked for, so a hold that lands on another row says so.
  const matches = text
    ? await page.evaluate(
        (wanted) =>
          [...document.querySelectorAll("main div.group")]
            .filter((el) => el.textContent.includes(wanted))
            .map((el) => `${el.getAttribute("data-message-id")} ${el.textContent.slice(0, 30)}`),
        text
      )
    : null
  console.log(`holdRow target: ${JSON.stringify({ wanted: text, rowTabbable, matches })}`)
  if (before) console.log(`holdRow found an open action sheet before the press: ${JSON.stringify({ before, rowTabbable })}`)
  // A thread that has just opened settles on its newest message a few frames later, and a scroll closes the actions. So the bubble is
  // brought to the middle at once, and the hold waits until its place stops changing.
  await bubble.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }))
  let box = await bubble.boundingBox()
  for (let still = 0; still < 2; ) {
    await new Promise((resolve) => setTimeout(resolve, 120))
    const next = await bubble.boundingBox()
    still = next && box && next.x === box.x && next.y === box.y ? still + 1 : 0
    box = next
  }
  if (!box) throw new Error("the message bubble has no place on screen to hold")
  // Notes what the page receives while the hold runs, so a hold that opens nothing says where its press went.
  await page.evaluate(() => {
    if (window.__holdLog) return
    window.__holdLog = []
    const who = (node) => (node instanceof Element ? `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 70)}${node.id ? `#${node.id}` : ""}` : "none")
    for (const type of ["pointerdown", "pointerup", "pointercancel", "scroll"]) {
      window.addEventListener(type, (event) => window.__holdLog.push(`${type} on ${who(event.target)}`), { capture: true, passive: true })
    }
  })
  await page.evaluate(() => (window.__holdLog.length = 0))
  // Traces the bubble itself during the hold: what the press lands on and what leaves, moves or drags it.
  await bubble.evaluate((el) => {
    const log = window.__holdLog
    const who = (node) => (node instanceof Element ? `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 70)}` : "none")
    for (const type of ["pointerdown", "pointerenter", "pointerleave", "pointermove", "pointercancel", "dragstart", "contextmenu"]) {
      el.addEventListener(
        type,
        (event) =>
          log.push(
            `bubble ${type} target ${who(event.target)} related ${who(event.relatedTarget)} at ${Math.round(event.clientX)},${Math.round(event.clientY)}`
          ),
        { passive: true }
      )
    }
  })
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  try {
    await page.getByRole("group", { name: "Choose a reaction" }).waitFor({ timeout: 5000 })
  } catch (error) {
    const what = await page.evaluate(
      ({ x, y }) => {
        const hit = document.elementFromPoint(x, y)
        const stack = document.elementsFromPoint(x, y).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)}`)
        return { under: hit ? `${hit.tagName.toLowerCase()} ${String(hit.className).slice(0, 80)}` : "nothing", stack, log: window.__holdLog.slice(0, 30) }
      },
      center
    )
    const after = await bubble.boundingBox().catch(() => null)
    throw new Error(
      `the actions did not open on hold; under the press: ${JSON.stringify(what)}; bubble before ${JSON.stringify(box)} after ${JSON.stringify(after)}; sheet open before the press: ${JSON.stringify(before)}; row: ${JSON.stringify(rowTabbable)}; matches: ${JSON.stringify(matches)}`,
      { cause: error }
    )
  } finally {
    await page.mouse.up()
  }
}

// Holds the message whose text is given.
export function holdMessage(page, text) {
  return holdRow(page, messageRow(page, text), text)
}

// Reacts to a message with the emoji at `index` of the picker. Returns the emoji.
export async function react(page, text, index = 0) {
  await holdMessage(page, text)
  const picker = page.getByRole("group", { name: "Choose a reaction" })
  const choice = picker.getByRole("button").nth(index)
  const emoji = (await choice.innerText()).trim()
  await acted(page, () => choice.click())
  return emoji
}

// The reaction chip under a message: emoji, count and whether it is the viewer's own.
export function reactionChip(page, text, emoji, count = 1, mine = true) {
  const label = new RegExp(`^${escapeRegExp(emoji)} ${count}${mine ? ", yours" : "$"}`)
  return messageRow(page, text).getByRole("button", { name: label })
}

// The Group info dialog of the conversation that is open.
export async function openGroupInfo(page) {
  await page.getByRole("button", { name: "Group info" }).click()
  const dialog = page.getByRole("dialog", { name: "Group info" })
  await dialog.waitFor()
  // The panel asks the server who made the group; its answer is what turns on the creator's controls.
  await dialog.getByText(/Creator|Only the person who made this group|You made this group/).first().waitFor()
  return dialog
}

// Closes the Group info dialog.
export async function closeGroupInfo(page) {
  await page.keyboard.press("Escape")
  await page.getByRole("dialog", { name: "Group info" }).waitFor({ state: "detached" })
}

// Starts a group from /messages/new and waits for the new conversation page.
export async function createGroupChat(page, { title, handles }) {
  await go(page, "/messages/new", page.locator("textarea[name=handles]"))
  if (title) await page.locator("input[name=title]").fill(title)
  await page.locator("textarea[name=handles]").fill(handles.join(" "))
  await acted(page, () => page.getByRole("button", { name: "Create group", exact: true }).click())
  await toastText(page, /^Group created/)
  return waitForConversation(page)
}
