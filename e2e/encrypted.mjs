// End-to-end encrypted direct chats. Needs the server to run with RHENKO_E2EE=1 and DATABASE_URL, so the check can look at what the
// server stored. Each person's browser makes its own device, a message is sealed for both devices, each side reads the other's
// words, and the database keeps no words of them.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { BASE, RUN_ID, escapeRegExp, randomWord } from "./lib/env.mjs"
import { createUser, signInElsewhere } from "./lib/accounts.mjs"
import { chatBox, sendChat, threadText, waitForConversation } from "./lib/chat.mjs"
import { openProfile } from "./lib/posts.mjs"
import { query } from "./lib/db.mjs"
import { makePng } from "./lib/files.mjs"
import { readFile } from "node:fs/promises"
import { acted, go, until } from "./lib/ui.mjs"

export async function run() {
  area("encrypted")
  await guard("an encrypted direct chat", chatFlow)
}

// Waits for a condition the page reaches on its own, such as a vote shown after the server answers. Fails with what it was waiting for.
async function eventually(holds, what, timeout = 15_000) {
  const deadline = Date.now() + timeout
  while (!(await holds())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

async function chatFlow() {
  const sender = await createUser({ tag: "ens" })
  const receiver = await createUser({ tag: "enr" })
  const first = `Sealed first ${RUN_ID}${randomWord(4)}`
  const reply = `Sealed reply ${RUN_ID}${randomWord(4)}`
  let convId = null

  await check("a new chat is encrypted, and the first message reads on the sender's device", async () => {
    await openProfile(sender.page, receiver.handle)
    await sender.page.getByRole("button", { name: /^Message @/ }).click()
    convId = await waitForConversation(sender.page)
    const [row] = await query("SELECT e2ee FROM conversations WHERE id = ?", convId)
    assert.equal(Number(row?.e2ee), 1, "the chat was not made encrypted")
    await sendChat(sender.page, first)
  })

  await check("the receiver reads the request's first message on their own device, after a fresh load", async () => {
    need(convId, "the conversation")
    await go(receiver.page, `/messages/${convId}`, threadText(receiver.page, first))
    await receiver.page.getByText("Accept the request to reply.").waitFor()
  })

  await check("once accepted, the reply reaches the sender decrypted, without a reload", async () => {
    need(convId, "the conversation")
    await acted(receiver.page, () => receiver.page.getByRole("button", { name: "Accept", exact: true }).click())
    await chatBox(receiver.page).waitFor()
    await sendChat(receiver.page, reply)
    await threadText(sender.page, reply).waitFor()
  })

  await check("the server keeps no words of the chat: no body text, and every message is sealed for both devices", async () => {
    need(convId, "the conversation")
    const rows = await query("SELECT id, body, cipher FROM chat_messages WHERE conversation_id = ?", convId)
    assert.ok(rows.length >= 2, `expected the two messages in the chat, found ${rows.length}`)
    for (const row of rows) {
      assert.equal(row.body, "", "a message's text is stored in the clear")
      assert.ok(row.cipher, "a message has no sealed envelope")
    }
    const leaked = await query(
      "SELECT COUNT(*) AS c FROM chat_messages WHERE conversation_id = ? AND (body LIKE ? OR cipher LIKE ? OR body LIKE ? OR cipher LIKE ?)",
      convId,
      `%${first}%`,
      `%${first}%`,
      `%${reply}%`,
      `%${reply}%`
    )
    assert.equal(Number(leaked[0].c), 0, "the words of a message are stored on the server")
    const wraps = await query(
      "SELECT m.id, COUNT(w.device_id) AS c FROM chat_messages m LEFT JOIN chat_message_wraps w ON w.message_id = m.id WHERE m.conversation_id = ? GROUP BY m.id",
      convId
    )
    for (const row of wraps) assert.ok(Number(row.c) >= 2, `a message has ${row.c} device copies, expected one for each person's device`)
  })

  await check("the receiver's thread still reads both messages after a fresh load", async () => {
    need(convId, "the conversation")
    await go(receiver.page, `/messages/${convId}`, threadText(receiver.page, first))
    await threadText(receiver.page, reply).waitFor()
  })

  await check("a photo sent in the chat loads for both people, and the server keeps only its ciphertext", async () => {
    need(convId, "the conversation")
    await sender.page.locator("input[name=image]").setInputFiles(makePng(`sealed-${RUN_ID}.png`, { seed: 9 }))
    const framing = sender.page.getByRole("dialog", { name: "Frame your photo" })
    await framing.getByRole("button", { name: "Use this", exact: true }).click()
    await framing.waitFor({ state: "detached" })
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    for (const person of [sender, receiver]) {
      await person.page.locator('main img[alt="Shared photo"]').first().waitFor()
      await until(person.page, () => {
        const image = document.querySelector('main img[alt="Shared photo"]')
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      })
    }
    const [row] = await query(
      "SELECT media_file FROM chat_messages WHERE conversation_id = ? AND media_file LIKE '%.sealed' ORDER BY created_at DESC LIMIT 1",
      convId
    )
    assert.ok(row, "the photo is not stored as a sealed file")
    const response = await sender.page.request.get(`${BASE}/media/${row.media_file}`)
    assert.equal(response.status(), 200, "a member could not load the sealed file")
    const bytes = await response.body()
    assert.equal(bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])), false, "the stored file is a plain PNG")
  })

  await check("a view-once photo is hidden until the other person opens it, and the server gives it out only after", async () => {
    need(convId, "the conversation")
    await sender.page.locator("input[name=image]").setInputFiles(makePng(`once-${RUN_ID}.png`, { seed: 11 }))
    const framing = sender.page.getByRole("dialog", { name: "Frame your photo" })
    await framing.getByRole("button", { name: "Use this", exact: true }).click()
    await framing.waitFor({ state: "detached" })
    await sender.page.getByRole("button", { name: "View once", exact: true }).click()
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    const [row] = await query(
      "SELECT media_file FROM chat_messages WHERE conversation_id = ? AND media_file LIKE '%.sealed' AND view_once = 1 ORDER BY created_at DESC LIMIT 1",
      convId
    )
    assert.ok(row, "the view-once photo is not stored")
    const tile = receiver.page.getByRole("button", { name: /View once photo/ }).first()
    await tile.waitFor()
    const before = await receiver.page.request.get(`${BASE}/media/${row.media_file}`)
    assert.equal(before.status(), 404, "the file was given out before the photo was opened")
    await acted(receiver.page, () => tile.click())
    await receiver.page.locator('main img[alt="Shared photo"]').last().waitFor()
    await until(receiver.page, () => {
      const images = document.querySelectorAll('main img[alt="Shared photo"]')
      const image = images[images.length - 1]
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
    })
    const after = await receiver.page.request.get(`${BASE}/media/${row.media_file}`)
    assert.equal(after.status(), 200, "the photo was not given out after it was opened")
  })

  await check("a document sent in the chat is listed for the other person, and saves with its own contents", async () => {
    need(convId, "the conversation")
    const name = `sealed-${RUN_ID}.txt`
    const text = `Sealed document ${RUN_ID}`
    await sender.page.locator("input[name=document]").setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from(text) })
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    const card = receiver.page.getByRole("button", { name: new RegExp(`^Download ${escapeRegExp(name)}`) }).first()
    await card.waitFor()
    const [download] = await Promise.all([receiver.page.waitForEvent("download"), card.click()])
    assert.equal(download.suggestedFilename(), name, "the saved file has another name")
    const saved = await (await import("node:fs/promises")).readFile(await download.path(), "utf8")
    assert.equal(saved, text, "the saved file does not hold what was sent")
  })

  await check("a sent message's words can be changed, the other person reads the change, and the server keeps neither version", async () => {
    need(convId, "the conversation")
    const before = `Sealed before edit ${RUN_ID}${randomWord(4)}`
    const after = `Sealed after edit ${RUN_ID}${randomWord(4)}`
    await sendChat(sender.page, before)
    await threadText(receiver.page, before).waitFor()
    await sender.page.getByRole("button", { name: "More message options" }).last().click()
    await sender.page.getByRole("menuitem", { name: "Edit", exact: true }).click()
    await sender.page.getByLabel("Edit message").fill(after)
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Save", exact: true }).click())
    await threadText(receiver.page, after).waitFor()
    const [row] = await query(
      "SELECT body, cipher, edited_at FROM chat_messages WHERE conversation_id = ? AND cipher IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      convId
    )
    assert.ok(row, "the edited message is not stored")
    assert.equal(row.body, "", "the edited text is stored in the clear")
    assert.ok(row.edited_at, "the edit was not recorded")
    assert.equal(String(row.cipher).includes(after), false, "the edited words are visible in the envelope")
    assert.equal(String(row.cipher).includes(before), false, "the words from before the edit are visible in the envelope")
  })

  await check("a contact is shared in the chat and shows its person to the other one, while the server keeps no account for it", async () => {
    need(convId, "the conversation")
    await sender.page.getByRole("button", { name: "Attach", exact: true }).click()
    await sender.page.getByRole("menuitem", { name: "Contact", exact: true }).click()
    const picker = sender.page.getByRole("dialog", { name: "Share a contact" })
    await picker.getByRole("button", { name: new RegExp(escapeRegExp(receiver.name)) }).click()
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    const card = receiver.page.locator(`main a[data-embed][href="/${receiver.handle}"]`).first()
    await card.waitFor()
    const [row] = await query(
      "SELECT body, attachment, cipher FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
      convId
    )
    assert.ok(row?.cipher, "the contact card is not sealed")
    assert.equal(row.attachment, null, "the server stores which account the contact card names")
    assert.equal(String(row.cipher).includes(receiver.handle), false, "the contact's handle is visible in the envelope")
  })

  await check("a place is shared in the chat, and the other person sees it", async () => {
    need(convId, "the conversation")
    await sender.context.grantPermissions(["geolocation"], { origin: BASE })
    await sender.context.setGeolocation({ latitude: 12.9716, longitude: 77.5946 })
    await sender.page.getByRole("button", { name: "Attach", exact: true }).click()
    await sender.page.getByRole("menuitem", { name: "Location", exact: true }).click()
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    await receiver.page.getByText("12.97160, 77.59460").first().waitFor()
    const [row] = await query(
      "SELECT attachment, cipher FROM chat_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1",
      convId
    )
    assert.ok(row?.cipher, "the place is not sealed")
    assert.equal(row.attachment, null, "the server stores the place")
    assert.equal(String(row.cipher).includes("12.9716"), false, "the coordinates are visible in the envelope")
  })

  await check("a poll is sent in the chat, the other person's vote is kept, and the server holds no question or choice words", async () => {
    need(convId, "the conversation")
    const question = `Sealed poll ${RUN_ID}${randomWord(4)}`
    const first = `Pizza ${RUN_ID}${randomWord(3)}`
    const second = `Soup ${RUN_ID}${randomWord(3)}`
    await sender.page.getByRole("button", { name: "Attach", exact: true }).click()
    await sender.page.getByRole("menuitem", { name: "Poll", exact: true }).click()
    const creator = sender.page.getByRole("dialog", { name: "Create a poll" })
    await creator.getByLabel("Question").fill(question)
    await creator.getByLabel("Choice 1").fill(first)
    await creator.getByLabel("Choice 2").fill(second)
    await creator.getByRole("button", { name: "Create poll", exact: true }).click()
    await acted(sender.page, () => sender.page.getByRole("button", { name: "Send", exact: true }).click())
    const group = receiver.page.getByRole("radiogroup", { name: question })
    await group.waitFor()
    const choice = group.getByRole("radio", { name: first })
    await acted(receiver.page, () => choice.click())
    await eventually(async () => (await choice.getAttribute("aria-checked")) === "true", "the vote shows as chosen")
    const [row] = await query(
      "SELECT attachment, cipher FROM chat_messages WHERE conversation_id = ? AND attachment IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      convId
    )
    assert.ok(row, "the poll is not stored")
    for (const words of [question, first, second]) {
      assert.equal(String(row.attachment).includes(words), false, "a poll's question or choice is stored on the server")
      assert.equal(String(row.cipher).includes(words), false, "a poll's question or choice is visible in the envelope")
    }
  })

  await check("a message is forwarded within the encrypted chat, is marked as forwarded, and the other person reads the copy", async () => {
    need(convId, "the conversation")
    const text = `Sealed to forward ${RUN_ID}${randomWord(4)}`
    await sendChat(sender.page, text)
    await threadText(receiver.page, text).waitFor()
    await sender.page.getByRole("button", { name: "More message options" }).last().click()
    await sender.page.getByRole("menuitem", { name: "Forward", exact: true }).click()
    const forwarding = sender.page.getByRole("dialog", { name: "Forward message" })
    await forwarding.getByRole("checkbox", { name: new RegExp(escapeRegExp(receiver.name)) }).click()
    await acted(sender.page, () => forwarding.getByRole("button", { name: "Forward", exact: true }).click())
    await receiver.page.getByText("Forwarded", { exact: true }).last().waitFor()
    await receiver.page.getByText(text).nth(1).waitFor()
    const copies = await query(
      "SELECT COUNT(*) AS c FROM chat_messages WHERE conversation_id = ? AND forwarded = 1 AND cipher IS NOT NULL AND body = ''",
      convId
    )
    assert.ok(Number(copies[0].c) >= 1, "the forwarded copy is not stored as a sealed, forwarded message")
  })

  await check("search in the chat finds a word in an encrypted message, on the device", async () => {
    need(convId, "the conversation")
    const needle = randomWord(8)
    const text = `Sealed search ${RUN_ID}${needle}`
    await sendChat(sender.page, text)
    await threadText(receiver.page, text).waitFor()
    await sender.page.getByRole("button", { name: "Chat options", exact: true }).click()
    await sender.page.getByRole("menuitem", { name: "Search in chat", exact: true }).click()
    const searching = sender.page.getByRole("dialog", { name: "Search this chat" })
    await searching.getByRole("searchbox").fill(needle)
    await searching.locator("mark", { hasText: needle }).first().waitFor()
    await sender.page.keyboard.press("Escape")
  })

  await check("export downloads the words of an encrypted chat in plain text, and the server refuses to export it", async () => {
    need(convId, "the conversation")
    await sender.page.getByRole("button", { name: "Chat options", exact: true }).click()
    const [download] = await Promise.all([
      sender.page.waitForEvent("download"),
      sender.page.getByRole("menuitem", { name: "Export chat", exact: true }).click(),
    ])
    const content = await readFile(await download.path(), "utf8")
    assert.ok(content.includes(`Sealed search ${RUN_ID}`), "the export does not hold the words of the chat")
    assert.ok(content.includes("Chat with"), "the export has no header")
    // The page's own request API, which shares the sender's sign-in: the browser does not log a refused export as a console error.
    const refused = await sender.page.request.get(`${BASE}/api/conversations/${convId}/export`)
    assert.equal(refused.status(), 409, "the server exported an encrypted chat")
  })

  await check("a second browser of the same person is linked from the first, and reads the chat's history on it", async () => {
    need(convId, "the conversation")
    const second = await signInElsewhere(receiver)
    // The account already has a device, so this browser can't make its own: it has to be linked from one of them.
    await go(second.page, "/settings/devices", second.page.getByRole("button", { name: "Link this browser", exact: true }))
    await acted(second.page, () => second.page.getByRole("button", { name: "Link this browser", exact: true }).click())
    const shown = second.page.locator('p[aria-live="polite"]')
    await eventually(async () => /^\d{3} \d{3}$/.test((await shown.innerText()).trim()), "the new browser's link code")
    const code = (await shown.innerText()).trim()
    // The person's first browser lists the request, and approves it once the code matches.
    await go(receiver.page, "/settings/devices", receiver.page.getByRole("heading", { name: "Waiting for approval" }))
    await receiver.page.getByText(code, { exact: true }).waitFor()
    await acted(receiver.page, () => receiver.page.getByRole("button", { name: "Approve", exact: true }).click())
    await second.page.getByText("This browser is linked, so it can read and send encrypted messages.").waitFor()
    await go(second.page, `/messages/${convId}`, threadText(second.page, first))
    await threadText(second.page, reply).waitFor()
    const [count] = await query(
      "SELECT COUNT(*) AS c FROM e2ee_devices d JOIN users u ON u.id = d.user_id WHERE u.handle = ? AND d.revoked_at IS NULL",
      receiver.handle
    )
    assert.equal(Number(count?.c), 2, "the account does not have two active devices after the link")
  })
}
