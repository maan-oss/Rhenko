// End-to-end encrypted direct chats. Needs the server to run with RHENKO_E2EE=1 and DATABASE_URL, so the check can look at what the
// server stored. Each person's browser makes its own device, a message is sealed for both devices, each side reads the other's
// words, and the database keeps no words of them.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { chatBox, sendChat, threadText, waitForConversation } from "./lib/chat.mjs"
import { openProfile } from "./lib/posts.mjs"
import { query } from "./lib/db.mjs"
import { acted, go } from "./lib/ui.mjs"

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
}
