// Unit checks for the message encryption in lib/e2ee.ts: a message opens on every device it was sent to and nowhere else,
// tampering and moving an envelope or a wrap are caught, the sender's signature is checked, and safety numbers match on
// both sides. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { E2eeError, decryptMessage, encryptMessage, generateDeviceKeys, safetyNumber } from "../lib/e2ee.ts"

const CONVERSATION = "conv-1"
const MESSAGE = "msg-1"

async function device(id) {
  return { id, keys: await generateDeviceKeys() }
}

const sender = await device("sender-phone")
const alice = await device("alice-phone")
const bob = await device("bob-laptop")
const stranger = await device("stranger")
const everyone = [sender, alice, bob, stranger]

function recipientsOf(devices) {
  return devices.map((d) => ({ device: d.id, agreement: d.keys.public.agreement }))
}

function signingDirectory(devices) {
  const map = new Map(devices.map((d) => [d.id, d.keys.public.signing]))
  return (id) => map.get(id) ?? null
}

// What the server stores: the envelope, and one wrap row per device.
async function seal(payload, { recipients = [sender, alice, bob], messageId = MESSAGE, conversationId = CONVERSATION } = {}) {
  const { envelope, wraps } = await encryptMessage({
    conversationId,
    messageId,
    senderDevice: sender.id,
    senderSigningPrivate: sender.keys.signingPrivate,
    payload,
    recipients: recipientsOf(recipients),
  })
  return { envelope, wraps }
}

// Opens a stored message on one device, the way the app will: the device's own wrap is looked up by its id.
async function open(stored, reader, { messageId = MESSAGE, conversationId = CONVERSATION, directory = everyone, wrapFor } = {}) {
  const row = wrapFor !== undefined ? wrapFor : (stored.wraps.find((w) => w.device === reader.id) ?? null)
  return decryptMessage({
    conversationId,
    messageId,
    raw: JSON.stringify(stored.envelope),
    device: reader.id,
    wrap: row ? { epk: row.epk, iv: row.iv, key: row.key } : null,
    agreementPrivate: reader.keys.agreementPrivate,
    senderSigning: signingDirectory(directory),
  })
}

test("every recipient device reads the same payload, sender included", async () => {
  const payload = { body: "Hello, café 👋", attachment: { kind: "location", lat: -27.47, lng: 153.02 } }
  const stored = await seal(payload)
  for (const reader of [sender, alice, bob]) {
    const result = await open(stored, reader)
    assert.deepEqual(result.payload, payload)
    assert.equal(result.sender, sender.id)
  }
})

test("the stored envelope and wraps do not contain the words", async () => {
  const stored = await seal({ body: "meet at the bridge at nine" })
  assert.doesNotMatch(JSON.stringify(stored), /bridge|nine/)
})

test("each device gets only its own wrap row", async () => {
  const stored = await seal({ body: "x" })
  assert.equal(stored.wraps.length, 3)
  assert.deepEqual(stored.wraps.map((w) => w.device).sort(), [alice.id, bob.id, sender.id].sort())
})

test("a device that was not sent the message cannot read it", async () => {
  const stored = await seal({ body: "for alice and sender only" }, { recipients: [sender, alice] })
  await assert.rejects(open(stored, bob), E2eeError)
})

test("a tampered ciphertext is refused", async () => {
  const stored = await seal({ body: "original" })
  const bytes = Buffer.from(stored.envelope.body, "base64")
  bytes[0] ^= 0xff
  const tampered = { envelope: { ...stored.envelope, body: bytes.toString("base64") }, wraps: stored.wraps }
  await assert.rejects(open(tampered, alice), E2eeError)
})

test("a tampered wrap is refused", async () => {
  const stored = await seal({ body: "original" })
  const row = stored.wraps.find((w) => w.device === alice.id)
  const bytes = Buffer.from(row.key, "base64")
  bytes[0] ^= 0xff
  await assert.rejects(open(stored, alice, { wrapFor: { ...row, key: bytes.toString("base64") } }), E2eeError)
})

test("an envelope cannot be moved to another message or conversation", async () => {
  const stored = await seal({ body: "bound to msg-1" })
  await assert.rejects(open(stored, alice, { messageId: "msg-2" }), E2eeError)
  await assert.rejects(open(stored, alice, { conversationId: "conv-2" }), E2eeError)
})

test("a wrap cannot be moved to another message", async () => {
  const first = await seal({ body: "first" }, { messageId: "msg-1" })
  const second = await seal({ body: "second" }, { messageId: "msg-2" })
  const borrowed = second.wraps.find((w) => w.device === alice.id)
  await assert.rejects(open(first, alice, { wrapFor: borrowed }), E2eeError)
})

test("a wrap meant for another device is refused", async () => {
  const stored = await seal({ body: "for alice" })
  const bobsWrap = stored.wraps.find((w) => w.device === bob.id)
  await assert.rejects(open(stored, alice, { wrapFor: bobsWrap }), E2eeError)
})

test("a message signed by another device is refused, even when it claims the sender", async () => {
  const { envelope, wraps } = await encryptMessage({
    conversationId: CONVERSATION,
    messageId: MESSAGE,
    senderDevice: sender.id,
    senderSigningPrivate: stranger.keys.signingPrivate,
    payload: { body: "from nobody you know" },
    recipients: recipientsOf([alice]),
  })
  await assert.rejects(open({ envelope, wraps }, alice), E2eeError)
})

test("an unknown sender device is refused", async () => {
  const stored = await seal({ body: "hi" })
  await assert.rejects(open(stored, alice, { directory: [alice] }), E2eeError)
})

test("a missing wrap is refused as not for this device", async () => {
  const stored = await seal({ body: "hi" })
  await assert.rejects(open(stored, alice, { wrapFor: null }), E2eeError)
})

test("an envelope that is not JSON or not the right shape is refused", async () => {
  await assert.rejects(
    decryptMessage({
      conversationId: CONVERSATION,
      messageId: MESSAGE,
      raw: "not json",
      device: alice.id,
      wrap: null,
      agreementPrivate: alice.keys.agreementPrivate,
      senderSigning: signingDirectory([sender]),
    }),
    E2eeError
  )
  await assert.rejects(
    decryptMessage({
      conversationId: CONVERSATION,
      messageId: MESSAGE,
      raw: JSON.stringify({ v: 2, sender: sender.id }),
      device: alice.id,
      wrap: null,
      agreementPrivate: alice.keys.agreementPrivate,
      senderSigning: signingDirectory([sender]),
    }),
    E2eeError
  )
})

test("a payload that is too large is refused before anything is sent", async () => {
  await assert.rejects(seal({ body: "x".repeat(40 * 1024) }), E2eeError)
})

test("safety numbers match on both sides and change when a key changes", async () => {
  const ours = [sender.keys.public.signing, sender.keys.public.agreement]
  const theirs = [alice.keys.public.signing, alice.keys.public.agreement, bob.keys.public.signing]
  const fromOurs = await safetyNumber(ours, theirs)
  const fromTheirs = await safetyNumber(theirs, ours)
  assert.equal(fromOurs, fromTheirs)
  assert.match(fromOurs, /^(\d{5} ){11}\d{5}$/)

  const changed = await generateDeviceKeys()
  const after = await safetyNumber(ours, [changed.public.signing, alice.keys.public.agreement, bob.keys.public.signing])
  assert.notEqual(after, fromOurs)
})

// ---------------------------------------------------------------------------------------------------------------------
// Checking a send before the server stores it (checkEncryptedSend)

import { checkEncryptedSend } from "../lib/e2ee.ts"

async function sendFixture() {
  const { envelope, wraps } = await seal({ body: "checked" }, { recipients: [sender, alice, bob] })
  const base = {
    envelope,
    wraps,
    senderDevice: sender.id,
    senderDevices: [sender.id],
    memberDevices: [sender.id, alice.id, bob.id],
    memberWithoutDevice: false,
  }
  return { base, envelope, wraps }
}

test("a send that covers every active device is accepted", async () => {
  const { base } = await sendFixture()
  const result = checkEncryptedSend(base)
  assert.equal(result.ok, true)
  assert.equal(result.wraps.length, 3)
})

test("a send is refused when a member has no device, a device is missing, or an extra device is included", async () => {
  const { base } = await sendFixture()
  assert.equal(checkEncryptedSend({ ...base, memberWithoutDevice: true }).ok, false)
  assert.equal(checkEncryptedSend({ ...base, memberDevices: [...base.memberDevices, "new-phone"] }).ok, false)
  const extra = { ...base, wraps: [...base.wraps, { device: "stranger", epk: "a", iv: "b", key: "c" }] }
  assert.equal(checkEncryptedSend(extra).ok, false)
  const missing = { ...base, wraps: base.wraps.slice(1) }
  assert.equal(checkEncryptedSend(missing).ok, false)
})

test("a send is refused when a device appears twice, or a wrap is malformed", async () => {
  const { base } = await sendFixture()
  const twice = { ...base, wraps: [base.wraps[0], base.wraps[0], base.wraps[1]] }
  assert.equal(checkEncryptedSend(twice).ok, false)
  const malformed = { ...base, wraps: [{ device: alice.id, epk: 1, iv: "x", key: "y" }, ...base.wraps.slice(1)] }
  assert.equal(checkEncryptedSend(malformed).ok, false)
  assert.equal(checkEncryptedSend({ ...base, wraps: "nope" }).ok, false)
})

test("a send is refused when the envelope is signed for another device, or is not an envelope", async () => {
  const { base } = await sendFixture()
  assert.equal(checkEncryptedSend({ ...base, senderDevice: alice.id, senderDevices: [alice.id] }).ok, false)
  assert.equal(checkEncryptedSend({ ...base, senderDevices: [bob.id] }).ok, false)
  assert.equal(checkEncryptedSend({ ...base, envelope: { v: 1, sender: sender.id } }).ok, false)
})
