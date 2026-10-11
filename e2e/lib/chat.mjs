// Direct messages and group chats: the conversation page, its composer, reactions, and the group panel.
import { escapeRegExp } from "./env.mjs"
import { acted, go, ready, streamOpen, toastText } from "./ui.mjs"

export function chatBox(page) {
  return page.getByRole("textbox", { name: "Message", exact: true })
}

// Opens a conversation by id and waits for the button every conversation has in its header, and for the live stream
// that brings new messages and calls to the open page.
export async function openChat(page, id) {
  await go(page, `/messages/${id}`, page.getByRole("button", { name: /^(Mute|Unmute) conversation$/ }))
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

// The whole row of one message: bubble, reactions and the small buttons that appear on hover.
export function messageRow(page, text) {
  return page.locator("main div.group").filter({ hasText: text }).last()
}

// Reacts to a message with the emoji at `index` of the picker. Returns the emoji.
export async function react(page, text, index = 0) {
  const row = messageRow(page, text)
  await row.hover()
  await row.getByRole("button", { name: "React" }).click()
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
