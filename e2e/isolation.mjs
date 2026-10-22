// Two people must never see each other's private pages, messages or pictures, including through a cache in front of the app.
// Each check uses separate accounts and reads what the server sends, not what the page shows.
import { area, assert, check, guard, need } from "./lib/harness.mjs"
import { BASE, RUN_ID, randomWord } from "./lib/env.mjs"
import { createUser } from "./lib/accounts.mjs"
import { createGroupChat, openChat, sendChat, threadText } from "./lib/chat.mjs"
import { makePng } from "./lib/files.mjs"
import { query } from "./lib/db.mjs"
import { block, follow } from "./lib/people.mjs"
import { acted } from "./lib/ui.mjs"

function uniq(label) {
  return `${label} ${RUN_ID}${randomWord(4)}`
}

// A page or picture that belongs to someone must say so to a cache: private, or no-store, never public.
function assertPrivate(response, label) {
  const cacheControl = response.headers()["cache-control"] || ""
  assert.match(cacheControl, /private|no-store/, `${label} is not marked private (Cache-Control: "${cacheControl}")`)
  assert.doesNotMatch(cacheControl, /(^|,\s*)public(,|$)/, `${label} can be kept by a shared cache (Cache-Control: "${cacheControl}")`)
}

export async function run() {
  area("isolation")
  await guard("private pages and pictures", privatePagesFlow)
  await guard("one person's group messages stay out of another person's pages", messagesFlow)
  await guard("a group picture follows the block between its sender and a member", pictureFlow)
}

async function privatePagesFlow() {
  const owner = await createUser({ tag: "isoo" })
  const stranger = await createUser({ tag: "isos" })

  await check("the owner's pages answer as private, to the owner's own browser only", async () => {
    for (const path of ["/messages", "/notifications", "/settings"]) {
      const response = await owner.page.context().request.get(`${BASE}${path}`, { maxRedirects: 0 })
      assert.equal(response.status(), 200, `${path} did not answer for its owner`)
      assertPrivate(response, path)
    }
  })

  await check("a signed-out visitor is sent to sign in before any private page, with nothing to cache", async () => {
    const anonymous = await owner.page.context().browser().newContext()
    try {
      for (const path of ["/messages", "/notifications", "/settings"]) {
        const response = await anonymous.request.get(`${BASE}${path}`, { maxRedirects: 0 })
        assert.ok([302, 303, 307, 308].includes(response.status()), `${path} answered ${response.status()} to a signed-out visitor`)
        assert.match(response.headers()["location"] || "", /\/login/, `${path} did not send a signed-out visitor to sign in`)
      }
    } finally {
      await anonymous.close()
    }
  })

  await check("another signed-in person's /messages does not carry the owner's name or private handles", async () => {
    const response = await stranger.page.context().request.get(`${BASE}/messages`, { maxRedirects: 0 })
    assert.equal(response.status(), 200, "the other person could not open their own Messages")
    assert.equal((await response.text()).includes(owner.handle), false, "another person's Messages page names the owner's handle")
    assertPrivate(response, "/messages for another person")
  })
}

async function messagesFlow() {
  const founder = await createUser({ tag: "isomf" })
  const memberA = await createUser({ tag: "isoma" })
  const memberB = await createUser({ tag: "isomb" })
  const outsider = await createUser({ tag: "isomo" })
  await follow(memberA.page, founder.handle)
  await follow(memberB.page, founder.handle)
  const secret = uniq("Private group line")
  const groupId = await createGroupChat(founder.page, { title: uniq("Private group"), handles: [memberA.handle, memberB.handle] })
  need(groupId, "the group")
  // A message reaches an open thread without a reload, so the member is on the thread before it is sent.
  await openChat(memberA.page, groupId)
  await openChat(founder.page, groupId)
  await sendChat(founder.page, secret)
  await threadText(memberA.page, secret).waitFor()

  await check("a group message never appears on the pages of someone who is not in the group", async () => {
    const thread = await outsider.page.context().request.get(`${BASE}/messages/${groupId}`, { maxRedirects: 0 })
    const threadBody = thread.status() === 200 ? await thread.text() : ""
    assert.equal(threadBody.includes(secret), false, "a person outside the group read its message")
    const list = await outsider.page.context().request.get(`${BASE}/messages`, { maxRedirects: 0 })
    assert.equal((await list.text()).includes(secret), false, "a person outside the group saw its message in their list")
  })
}

async function pictureFlow() {
  const founder = await createUser({ tag: "isopf" })
  const sharer = await createUser({ tag: "isops" })
  const other = await createUser({ tag: "isopo" })
  const outsider = await createUser({ tag: "isopx" })
  await follow(sharer.page, founder.handle)
  await follow(other.page, founder.handle)
  const groupId = await createGroupChat(founder.page, { title: uniq("Photo group"), handles: [sharer.handle, other.handle] })
  need(groupId, "the group")

  await openChat(sharer.page, groupId)
  await sharer.page.locator("input[name=image]").setInputFiles(makePng(`isolation-${RUN_ID}.png`, { seed: 9 }))
  const framing = sharer.page.getByRole("dialog", { name: "Frame your photo" })
  await framing.getByRole("button", { name: "Use this", exact: true }).click()
  await framing.waitFor({ state: "detached" })
  await sharer.page.getByAltText("Photo to send").waitFor()
  await acted(sharer.page, () => sharer.page.getByRole("button", { name: "Send", exact: true }).click())

  const [row] = await query(
    "SELECT media_file FROM chat_messages WHERE conversation_id = ? AND media_file IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    groupId
  )
  need(row?.media_file, "the photo the sharer sent")
  const picture = `${BASE}/media/${row.media_file}`

  await check("a group picture answers to its members as private, and to nobody outside the group", async () => {
    const member = await founder.page.context().request.get(picture, { maxRedirects: 0 })
    assert.equal(member.status(), 200, "a member of the group could not open the picture")
    assertPrivate(member, "a group picture")
    const stranger = await outsider.page.context().request.get(picture, { maxRedirects: 0 })
    assert.equal(stranger.status(), 404, "a person outside the group could open the picture")
  })

  await check("once the other member blocks the sharer, the picture is refused to that member and still shows to the rest", async () => {
    await block(other.page, sharer.handle)
    const blocked = await other.page.context().request.get(picture, { maxRedirects: 0 })
    assert.equal(blocked.status(), 404, "a member who blocked the sharer could still open their picture")
    const founderAgain = await founder.page.context().request.get(picture, { maxRedirects: 0 })
    assert.equal(founderAgain.status(), 200, "the founder lost the picture after an unrelated block")
  })
}
