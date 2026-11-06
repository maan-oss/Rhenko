// End-to-end encrypted direct chats. Needs the server to run with RHENKO_E2EE=1 and DATABASE_URL, so the check can look at what the
// server stored. Each person's browser makes its own device, a message is sealed for both devices, each side reads the other's
// words, and the database keeps no words of them.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { BASE, RUN_ID, escapeRegExp, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { chatBox, sendChat, threadText, waitForConversation } from "./lib/chat.mjs"
import { openProfile } from "./lib/posts.mjs"
import { query } from "./lib/db.mjs"
import { makePng } from "./lib/files.mjs"
import { acted, go, until } from "./lib/ui.mjs"

export async function run() {
  area("encrypted")
  await guard("an encrypted direct chat", chatFlow)
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
}
