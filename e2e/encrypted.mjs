// End-to-end encrypted direct chats. Needs the server to run with RHENKO_E2EE=1 and DATABASE_URL, so the check can look at what the
// server stored. Each person's browser makes its own device, a message is sealed for both devices, each side reads the other's
// words, and the database keeps no words of them.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { BASE, RUN_ID, escapeRegExp, randomWord } from "./lib/env.mjs"
import { createUser, signInElsewhere } from "./lib/accounts.mjs"
import { chatBox, holdMessage, holdRow, sendChat, threadText, waitForConversation } from "./lib/chat.mjs"
import { openProfile } from "./lib/posts.mjs"
import { query } from "./lib/db.mjs"
import { makePng } from "./lib/files.mjs"
import { readFile } from "node:fs/promises"
import { acted, go, toastText, until } from "./lib/ui.mjs"

const DAY = 24 * 60 * 60 * 1000

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

// The safety number a person sees for the other person in a chat, read from the contact info dialog: twelve groups of five digits.
async function safetyNumberShown(page, convId) {
  const options = page.getByRole("button", { name: "Chat options", exact: true })
  await go(page, `/messages/${convId}`, options)
  await options.click()
  await page.getByRole("menuitem", { name: "Contact info", exact: true }).click()
  const section = page.locator('section[aria-labelledby="chat-safety"]')
  let groups = []
  await eventually(async () => {
    if ((await section.count()) === 0) return false
    groups = (await section.innerText()).match(/\b\d{5}\b/g) ?? []
    return groups.length === 12
  }, "the safety number in contact info")
  await page.keyboard.press("Escape")
  return groups.join(" ")
}

// This browser's encryption database (lib/e2ee-keystore.ts): the ids of the devices it holds keys for, and the signing key it first
// saw for each device in a chat. The page reads and writes them directly, the way the app does.
async function deviceIds(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("rhenko-e2ee")
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const keys = db.transaction("devices", "readonly").objectStore("devices").getAllKeys()
          keys.onsuccess = () => {
            db.close()
            resolve(keys.result)
          }
          keys.onerror = () => {
            db.close()
            reject(keys.error)
          }
        }
      })
  )
}

async function pinnedKey(page, device) {
  return page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("rhenko-e2ee")
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const get = db.transaction("pins", "readonly").objectStore("pins").get(id)
          get.onsuccess = () => {
            db.close()
            resolve(get.result ?? null)
          }
          get.onerror = () => {
            db.close()
            reject(get.error)
          }
        }
      }),
    device
  )
}

async function setPinnedKey(page, device, value) {
  await page.evaluate(
    ({ id, signing }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("rhenko-e2ee")
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction("pins", "readwrite")
          transaction.objectStore("pins").put(signing, id)
          transaction.oncomplete = () => {
            db.close()
            resolve()
          }
          transaction.onerror = () => {
            db.close()
            reject(transaction.error)
          }
        }
      }),
    { id: device, signing: value }
  )
}

async function chatFlow() {
  const sender = await createUser({ tag: "ens" })
  const receiver = await createUser({ tag: "enr" })
  const first = `Sealed first ${RUN_ID}${randomWord(4)}`
  const reply = `Sealed reply ${RUN_ID}${randomWord(4)}`
  let convId = null
  let numberBefore = null
  let second = null

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
    await receiver.page.getByText("Accept this request to reply.").waitFor()
  })

  await check("once accepted, the reply reaches the sender decrypted, without a reload", async () => {
    need(convId, "the conversation")
    await acted(receiver.page, () => receiver.page.getByRole("button", { name: "Accept", exact: true }).click())
    await chatBox(receiver.page).waitFor()
    await sendChat(receiver.page, reply)
    await threadText(sender.page, reply).waitFor()
  })

  await check("both people see the same safety number for each other, made of sixty digits", async () => {
    need(convId, "the conversation")
    numberBefore = await safetyNumberShown(sender.page, convId)
    assert.match(numberBefore, /^(\d{5} ){11}\d{5}$/, "the sender's safety number is not sixty digits")
    const theirs = await safetyNumberShown(receiver.page, convId)
    assert.equal(theirs, numberBefore, "the two people see different safety numbers")
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

  await check("the other person's message can be reported: the report is sealed on the device, and the server keeps none of its words", async () => {
    need(convId, "the conversation")
    await holdMessage(receiver.page, first)
    await receiver.page.getByRole("button", { name: "More message options" }).click()
    await receiver.page.getByRole("menuitem", { name: "Report", exact: true }).click()
    const dialog = receiver.page.getByRole("dialog", { name: "Report message" })
    await dialog.getByText("Spam", { exact: true }).click()
    await acted(receiver.page, () => dialog.getByRole("button", { name: "Report", exact: true }).click())
    await toastText(receiver.page, "Report sent.")
    const rows = await query("SELECT id, kid, reason, sealed, status, created_at, retain_until FROM chat_reports WHERE conversation_id = ?", convId)
    assert.equal(rows.length, 1, `expected one report of the chat, found ${rows.length}`)
    const [report] = rows
    assert.equal(report.status, "open")
    assert.equal(report.reason, "Spam")
    assert.ok(!report.sealed.includes(first), "the reported words are stored in the clear")
    const sealed = JSON.parse(report.sealed)
    assert.equal(sealed.v, 1)
    assert.equal(sealed.kid, report.kid, "the report is not sealed to the key it names")
    assert.ok(Number(report.retain_until) - Number(report.created_at) >= 364 * DAY, "the report is not kept for a year")
    // The report is only made once: reporting the same message again changes nothing.
    await holdMessage(receiver.page, first)
    await receiver.page.getByRole("button", { name: "More message options" }).click()
    await receiver.page.getByRole("menuitem", { name: "Report", exact: true }).click()
    await receiver.page.getByRole("dialog", { name: "Report message" }).getByRole("button", { name: "Report", exact: true }).click()
    await toastText(receiver.page, "Report sent.")
    const again = await query("SELECT COUNT(*) AS c FROM chat_reports WHERE conversation_id = ?", convId)
    assert.equal(Number(again[0].c), 1, "a second report of the same message was stored")
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
    // The photo is stored once the server answers, which can be after the send is shown, so the row is awaited.
    let row = null
    await eventually(async () => {
      ;[row] = await query(
        "SELECT media_file FROM chat_messages WHERE conversation_id = ? AND media_file LIKE '%.sealed' AND view_once = 1 ORDER BY created_at DESC LIMIT 1",
        convId
      )
      return row !== undefined
    }, "the view-once photo to be stored")
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
    await holdRow(sender.page, sender.page.locator("main div.group").last())
    await sender.page.getByRole("button", { name: "More message options" }).click()
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
    await receiver.page.getByRole("link", { name: "Shared location, open in Maps" }).first().waitFor()
    // The card draws its own map and never writes the place out, so the coordinates are not on the page at all.
    assert.equal(/12\.97|77\.59/.test(await receiver.page.locator("main").innerText()), false, "the place's coordinates are written out on the page")
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
    await holdRow(sender.page, sender.page.locator("main div.group").last())
    await sender.page.getByRole("button", { name: "More message options" }).click()
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
    second = await signInElsewhere(receiver)
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
    await second.page.getByText("Linked and ready.").waitFor()
    await go(second.page, `/messages/${convId}`, threadText(second.page, first))
    await threadText(second.page, reply).waitFor()
    const [count] = await query(
      "SELECT COUNT(*) AS c FROM e2ee_devices d JOIN users u ON u.id = d.user_id WHERE u.handle = ? AND d.revoked_at IS NULL",
      receiver.handle
    )
    assert.equal(Number(count?.c), 2, "the account does not have two active devices after the link")
  })

  await check("linking a browser changes the safety number, and the first browsers and the new one all show the new number", async () => {
    need(convId, "the conversation")
    need(second, "the new browser")
    need(numberBefore, "the safety number before the link")
    const after = await safetyNumberShown(sender.page, convId)
    assert.notEqual(after, numberBefore, "the safety number did not change when a browser was linked")
    assert.equal(await safetyNumberShown(receiver.page, convId), after, "the first browser shows a different number from the other person")
    assert.equal(await safetyNumberShown(second.page, convId), after, "the new browser shows a different number")
  })

  await check("a device whose signing key has changed is refused with a notice, and its messages read again once the key is back", async () => {
    need(convId, "the conversation")
    const devices = await deviceIds(sender.page)
    assert.equal(devices.length, 1, `expected one device in the sender's browser, found ${devices.length}`)
    const device = devices[0]
    const original = await pinnedKey(receiver.page, device)
    assert.ok(original, "the receiver's browser has not remembered the sender's key, so there is nothing to change")
    const words = `Sent after a key changed ${RUN_ID}${randomWord(4)}`
    try {
      // The browser keeps the key it first saw for each device. A different value there is what a changed key looks like to it.
      await setPinnedKey(receiver.page, device, "a key this browser never saw")
      await go(sender.page, `/messages/${convId}`, chatBox(sender.page))
      await sendChat(sender.page, words)
      await receiver.page.locator("main").getByText("has a different key from the one this browser saw before").first().waitFor()
      assert.equal(await receiver.page.locator("main").getByText(words).count(), 0, "the words of a message from a changed key are shown")
    } finally {
      await setPinnedKey(receiver.page, device, original)
    }
    // A fresh load forgets which keys had changed, so the same message reads once the key is back.
    await go(receiver.page, `/messages/${convId}`, threadText(receiver.page, words))
    await threadText(receiver.page, first).waitFor()
  })
}
