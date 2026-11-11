// The browser side of encrypted chats: this browser's device, and sealing, sending, editing and forwarding the messages of a chat, and
// opening the sealed messages a thread shows. The cryptography is in lib/e2ee.ts and lib/e2ee-media.ts, and the keys stay in
// lib/e2ee-keystore.ts. The server only sees envelopes, wraps, public keys, the encrypted bytes of a file, and the ids of a poll's
// choices. Browser only.

import { decryptMessage, E2eeError, encryptMessage, generateDeviceKeys, rewrapFor, type DeviceKeys, type Envelope, type Recipient, type Wrap } from "@/lib/e2ee"
import { openFile, sealFile } from "@/lib/e2ee-media"
import { loadDeviceKeys, pinnedSigningKey, pinSigningKey, saveDeviceKeys } from "@/lib/e2ee-keystore"
import {
  isSealableMime,
  parsePayload,
  type MessagePayload,
  type SealedAttachmentView,
  type SealedMediaKind,
  type SealedMediaView,
} from "@/lib/e2ee-chat"
import { mentionedHandles } from "@/lib/chat-message-rules"
import { pollInput } from "@/lib/poll-rules"
import { MAX_DM, MAX_IMAGE_BYTES } from "@/lib/rules"
import {
  copyTargetForLink,
  deviceLinkStatus,
  historyBatchForLink,
  setUpThisDevice,
  startDeviceLink,
  storeCopiedKeys,
  thisDevice,
} from "@/actions/e2ee"
import { HISTORY_BATCH_MAX, LINK_REQUIRED } from "@/lib/e2ee-link-rules"
import {
  editEncryptedMessage,
  encryptionTargets,
  sealedContact,
  sendEncryptedMedia,
  sendEncryptedMessage,
  signingKeysOf,
} from "@/actions/messages"

const UNSUPPORTED = "This browser can't encrypt messages here. Open Rhenko over HTTPS in a current browser."
// The same reason a plaintext chat gives, so a dropped connection reads the same in both kinds of chat.
const SEND_FAILED = "Your message did not send. Check your connection and try again."
const OPEN_FAILED = "This message couldn't be opened on this device."
const NOT_OPENED_HERE = "Sent before this device could read the chat."
const PHOTO_FAILED = "That photo couldn't be prepared. Try another."
const NOT_SEALABLE = "That kind of file can't be sent in an encrypted chat."
const TOO_LARGE_PHOTO = "That picture is too large to send. Choose a smaller one."
const TOO_LONG = "Messages can have up to 1000 characters."
const NOT_IN_CHAT = "That person isn't in this chat, so their contact can't be shared here."
const CONTACT_ELSEWHERE = "A contact card can only go to a chat with that person in it."
const POLL_NOT_FORWARDABLE = "A poll can't be forwarded. Make a new one in the chat you want it in."
const VIEW_ONCE_NOT_FORWARDABLE = "A view-once photo can't be forwarded."
const WORDS_ONLY = "Only the words of a message can be edited."
const BAD_PLACE = "That place isn't valid."
const NO_TARGET = "Choose a chat to forward to."

export type SealedSend = { ok: true } | { ok: false; error: string }
export type ForwardResult = { ok: true; count: number } | { ok: false; error: string }
// A message as this device reads it: its text, and what it carries beyond its words (a file, a place, an account or a poll).
export type OpenedMessage = { ok: true; text: string; attachment: SealedAttachmentView | null } | { ok: false; error: string }
export type SealedInput = { id: string; envelope: string; wrap: Wrap | null; file: string | null }
// A sealed message a device acts on (edits or forwards): the chat it is in, and the message itself as the thread holds it.
export type SealedSource = SealedInput & { conversationId: string }

// A file to send in an encrypted chat, with the words that come with it.
export type SealedFileInput = {
  conversationId: string
  file: File
  kind: SealedMediaKind
  // The type the file has, without its codecs. Checked against what the kind may carry before anything is sent.
  mime: string
  // What the file is called to the people it is sent to. A voice note has no name of its own.
  name: string
  body: string
  replyTo: string | null
  scan: boolean
  viewOnce: boolean
}

type OwnDevice = { id: string; keys: DeviceKeys }

// One provisioning at a time, so a page that asks twice does not make two devices.
let provisioning: Promise<OwnDevice> | null = null

// This browser's device for the signed-in account, made on first use. A browser that has no keys for its device makes a new one, and
// the server retires the old device (registerDevice), so the old device cannot read anything sent from now on.
export function readyDevice(): Promise<OwnDevice> {
  if (!provisioning) {
    provisioning = provisionDevice().catch((error: unknown) => {
      provisioning = null
      throw error
    })
  }
  return provisioning
}

async function provisionDevice(): Promise<OwnDevice> {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.randomUUID) throw new E2eeError(UNSUPPORTED)
  const current = await thisDevice()
  if (current) {
    const keys = await loadDeviceKeys(current.id)
    if (keys) return { id: current.id, keys }
  }
  const keys = await generateDeviceKeys()
  const setup = await setUpThisDevice({ agreement: keys.public.agreement, signing: keys.public.signing, label: browserLabel() })
  if (!setup.ok) throw setup.error === LINK_REQUIRED ? new DeviceLinkRequired(LINK_NEEDED) : new E2eeError(setup.error)
  await saveDeviceKeys(setup.deviceId, keys)
  return { id: setup.deviceId, keys }
}

// The account already has devices, so this browser has to be linked from one of them before it can read or send encrypted messages.
export class DeviceLinkRequired extends E2eeError {}
const LINK_NEEDED = "Link this browser from a device you're signed in on, to read and send encrypted messages."
const LINK_POLL_MS = 2000
// Linking keeps asking for a little after the code runs out, so a late approval at the edge is still seen.
const LINK_POLL_GRACE_MS = 5000

// Links this browser to the account from a device the account already has. `onCode` is given the code to show as soon as there is one.
// Resolves once a device approves it: this browser has then kept its keys, and can read the account's history as the approving device
// copies it across. Resolves with a failure when the code runs out, or when `stillWaiting` says to stop.
export async function linkThisBrowser(
  onCode: (code: string) => void,
  stillWaiting: () => boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!globalThis.crypto?.subtle) return { ok: false, error: UNSUPPORTED }
  const keys = await generateDeviceKeys()
  const started = await startDeviceLink({ agreement: keys.public.agreement, signing: keys.public.signing, label: browserLabel() })
  if (!started.ok) return started
  onCode(started.code)
  while (stillWaiting() && Date.now() < started.expiresAt + LINK_POLL_GRACE_MS) {
    await new Promise((resolve) => setTimeout(resolve, LINK_POLL_MS))
    const status = await deviceLinkStatus(started.code)
    if (!status.ok) return status
    if (status.state.status === "approved") {
      await saveDeviceKeys(status.state.deviceId, keys)
      provisioning = Promise.resolve({ id: status.state.deviceId, keys })
      return { ok: true }
    }
    if (status.state.status === "expired") return { ok: false, error: "That code ran out. Start again to get a new one." }
  }
  return { ok: false, error: "Linking stopped before a device approved it." }
}

// Copies the account's message keys to the device an approved link made, a page at a time, from this device. Each key is read here only
// to be wrapped for the new device; nothing leaves this device in the clear. `count` is the keys the new browser gained, and `skipped` is
// the messages this browser could not open to copy (they stay unreadable there). Running it again is safe: keys already copied are not
// copied twice.
export async function shareHistoryWithLink(
  code: string,
  onProgress: (copied: number) => void
): Promise<{ ok: true; count: number; skipped: number } | { ok: false; error: string }> {
  const own = await readyDevice()
  const target = await copyTargetForLink(code)
  if (!target.ok) return target
  let after = ""
  let count = 0
  let skipped = 0
  for (;;) {
    const page = await historyBatchForLink(code, after)
    if (!page.ok) return page
    const wraps: Array<{ messageId: string; epk: string; iv: string; key: string }> = []
    for (const row of page.rows) {
      try {
        const copy = await rewrapFor({
          conversationId: row.conversationId,
          messageId: row.messageId,
          raw: row.cipher,
          device: own.id,
          wrap: { epk: row.epk, iv: row.iv, key: row.key },
          agreementPrivate: own.keys.agreementPrivate,
          recipient: { device: target.deviceId, agreement: target.agreement },
        })
        wraps.push({ messageId: row.messageId, ...copy })
      } catch {
        // Not copied: the message stays unreadable on the new device, as it is on this one.
        skipped++
      }
    }
    if (wraps.length > 0) {
      const stored = await storeCopiedKeys(code, wraps)
      if (!stored.ok) return stored
      count += stored.count
      onProgress(count)
    }
    if (page.rows.length < HISTORY_BATCH_MAX) break
    after = page.rows[page.rows.length - 1].messageId
  }
  return { ok: true, count, skipped }
}

// The name a linked browser is listed under, the way a person would say it: "Chrome on iPhone", "Safari on Mac". Not the
// platform string ("Linux x86_64"), which reads as a computer's name even on a phone.
function browserLabel(): string {
  const agent = typeof navigator !== "undefined" ? navigator.userAgent : ""
  const system = /iPhone/.test(agent) ? "iPhone" : /iPad/.test(agent) ? "iPad" : /Android/.test(agent) ? "Android" : /Windows/.test(agent) ? "Windows" : /CrOS/.test(agent) ? "ChromeOS" : /Mac OS X|Macintosh/.test(agent) ? "Mac" : /Linux/.test(agent) ? "Linux" : null
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox|FxiOS/.test(agent) ? "Firefox" : /CriOS|Chrome|Chromium/.test(agent) ? "Chrome" : /Safari/.test(agent) ? "Safari" : null
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? "Browser"
}

// What sealing a message needs: this browser's device, and every device that should be able to read it. Refused while someone in the
// chat has no device yet, or when this browser's keys no longer belong to the account.
type Sealing = { ok: true; own: OwnDevice; recipients: Recipient[] } | { ok: false; error: string }
type SealingOk = Extract<Sealing, { ok: true }>

async function readyToSeal(conversationId: string): Promise<Sealing> {
  const own = await readyDevice()
  const targets = await encryptionTargets(conversationId)
  if (!targets.ok) return { ok: false, error: targets.error }
  if (targets.memberWithoutDevice) {
    return { ok: false, error: "Someone in this chat hasn't turned on encrypted messages yet, so this message can't be sent." }
  }
  if (targets.viewerDevice !== own.id) {
    return { ok: false, error: "This browser's keys no longer match your account. Reload and try again." }
  }
  return { ok: true, own, recipients: targets.recipients }
}

// The server-side part of a send: who is mentioned, which poll it carries, and what it answers or forwards.
type SendOptions = {
  replyTo: string | null
  mentions: string[]
  poll: { ids: string[]; multiple: boolean } | null
  forwardOf: string | null
  // A post shared into the chat. Its id is visible to the server, as it is for a post shared in a chat that is not encrypted.
  postId?: string | null
}

// The messages this browser sent, by id, with the envelope they were sealed as and the payload they carry. The sender already has the
// payload, so its own messages can read as soon as they reach the page, rather than after this device opens them again. Only the last
// few are kept, in this page's memory.
const SENT_HERE_LIMIT = 200
// The signature is what identifies an envelope: the server returns it as JSON text, so it is compared as its signature, not as text.
const sentHere = new Map<string, { sig: string; payload: MessagePayload }>()

function rememberSent(messageId: string, envelope: Envelope, payload: MessagePayload) {
  sentHere.set(messageId, { sig: envelope.sig, payload })
  if (sentHere.size > SENT_HERE_LIMIT) {
    const oldest = sentHere.keys().next().value
    if (oldest !== undefined) sentHere.delete(oldest)
  }
}

// The payload this browser sealed for a message, if the envelope on the page carries the signature it sent. An edited message has a new
// signature, so its new text is opened as usual.
function sentPayload(messageId: string, envelope: string): MessagePayload | null {
  const sent = sentHere.get(messageId)
  if (!sent) return null
  let sig: unknown
  try {
    sig = (JSON.parse(envelope) as { sig?: unknown }).sig
  } catch {
    return null
  }
  return sig === sent.sig ? sent.payload : null
}

// The text of a plain text message this browser sent, when it is still on the page. Other kinds are opened as usual.
export function sentText(messageId: string, envelope: string): OpenedMessage | null {
  const sent = sentPayload(messageId, envelope)
  return sent?.kind === "text" ? { ok: true, text: sent.body, attachment: null } : null
}

// Seals a payload for every device in the chat and sends it as a new message. The message id is picked here, because it is bound into
// the encryption.
async function sendSealedPayload(conversationId: string, payload: MessagePayload, options: SendOptions): Promise<SealedSend> {
  try {
    const sealing = await readyToSeal(conversationId)
    if (!sealing.ok) return sealing
    const messageId = crypto.randomUUID()
    const sealed = await encryptMessage({
      conversationId,
      messageId,
      senderDevice: sealing.own.id,
      senderSigningPrivate: sealing.own.keys.signingPrivate,
      payload,
      recipients: sealing.recipients,
    })
    rememberSent(messageId, sealed.envelope, payload)
    const result = await sendEncryptedMessage({
      conversationId,
      id: messageId,
      envelope: sealed.envelope,
      wraps: sealed.wraps,
      replyTo: options.replyTo,
      mentions: options.mentions,
      poll: options.poll,
      forwardOf: options.forwardOf,
      postId: options.postId ?? null,
    })
    if (result.error) return { ok: false, error: result.error }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof E2eeError ? error.message : SEND_FAILED }
  }
}

// Seals a text message for every device in the chat and sends it.
export async function sendSealedText(input: { conversationId: string; body: string; replyTo: string | null }): Promise<SealedSend> {
  return sendSealedPayload(input.conversationId, { kind: "text", body: input.body }, {
    replyTo: input.replyTo,
    mentions: mentionedHandles(input.body),
    poll: null,
    forwardOf: null,
  })
}

// Shares a post into an encrypted chat with a note. The note is sealed; the post is the card the thread shows, by its id. The share
// sheet calls this for each encrypted chat its post share returns (actions/messages.ts sharePostWith).
export async function sendEncryptedPostShare(input: { conversationId: string; postId: string; note: string }): Promise<SealedSend> {
  const note = input.note.replace(/\r\n/g, "\n").trim()
  if ([...note].length > MAX_DM) return { ok: false, error: TOO_LONG }
  return sendSealedPayload(input.conversationId, { kind: "text", body: note }, {
    replyTo: null,
    mentions: mentionedHandles(note),
    poll: null,
    forwardOf: null,
    postId: input.postId,
  })
}

// Shares a contact: another account in the chat. Its id is sealed in the message, so the server does not learn who was shared.
export async function sendSealedContact(input: { conversationId: string; userId: string; body: string; replyTo: string | null }): Promise<SealedSend> {
  if (!(await sealedContact(input.conversationId, input.userId))) return { ok: false, error: NOT_IN_CHAT }
  return sendSealedPayload(input.conversationId, { kind: "contact", body: input.body, userId: input.userId }, {
    replyTo: input.replyTo,
    mentions: mentionedHandles(input.body),
    poll: null,
    forwardOf: null,
  })
}

// Shares a place. The coordinates are sealed in the message.
export async function sendSealedLocation(input: {
  conversationId: string
  lat: number
  lng: number
  body: string
  replyTo: string | null
}): Promise<SealedSend> {
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) {
    return { ok: false, error: BAD_PLACE }
  }
  return sendSealedPayload(input.conversationId, { kind: "location", body: input.body, lat: input.lat, lng: input.lng }, {
    replyTo: input.replyTo,
    mentions: mentionedHandles(input.body),
    poll: null,
    forwardOf: null,
  })
}

// Sends a poll. Its question and choices are sealed; the server gets only the ids of the choices, which the votes name.
export async function sendSealedPoll(input: {
  conversationId: string
  question: string
  choices: string[]
  multiple: boolean
  body: string
  replyTo: string | null
}): Promise<SealedSend> {
  const checked = pollInput({ question: input.question, choices: input.choices, multiple: input.multiple })
  if (!checked.ok) return { ok: false, error: checked.error }
  const options = checked.choices.map((label) => ({ id: crypto.randomUUID(), label }))
  return sendSealedPayload(
    input.conversationId,
    { kind: "poll", body: input.body, question: checked.question, options, multiple: checked.multiple },
    {
      replyTo: input.replyTo,
      mentions: mentionedHandles(input.body),
      poll: { ids: options.map((option) => option.id), multiple: checked.multiple },
      forwardOf: null,
    }
  )
}

// A file's bytes, its words and what it is, ready to seal. The bytes are already the ones to send (a photo has had its place and camera
// details removed before this).
type FileSend = {
  conversationId: string
  plain: ArrayBuffer
  media: SealedMediaKind
  mime: string
  name: string
  body: string
  scan: boolean
  viewOnce: boolean
  replyTo: string | null
  mentions: string[]
  forwardOf: string | null
}

// Seals a file under its own key and sends it with its message. The key goes into the message's payload, so the server stores only the
// encrypted bytes. The file is uploaded together with the message, so a refused message leaves no file behind.
async function sendSealedFile(input: FileSend, sealing: SealingOk): Promise<SealedSend> {
  const messageId = crypto.randomUUID()
  const file = await sealFile(input.plain, input.conversationId, messageId)
  const payload: MessagePayload = {
    kind: "media",
    body: input.body,
    media: input.media,
    mime: input.mime,
    name: input.name,
    size: input.plain.byteLength,
    key: file.key,
    iv: file.iv,
    scan: input.scan,
    viewOnce: input.viewOnce,
  }
  const sealed = await encryptMessage({
    conversationId: input.conversationId,
    messageId,
    senderDevice: sealing.own.id,
    senderSigningPrivate: sealing.own.keys.signingPrivate,
    payload,
    recipients: sealing.recipients,
  })
  rememberSent(messageId, sealed.envelope, payload)
  const form = new FormData()
  form.append("conversationId", input.conversationId)
  form.append("id", messageId)
  form.append("replyTo", input.replyTo ?? "")
  form.append("envelope", JSON.stringify(sealed.envelope))
  form.append("wraps", JSON.stringify(sealed.wraps))
  form.append("mentions", JSON.stringify(input.mentions))
  form.append("viewOnce", input.viewOnce ? "on" : "")
  form.append("forwardOf", input.forwardOf ?? "")
  form.append("media", new Blob([file.bytes], { type: "application/octet-stream" }), "media")
  const result = await sendEncryptedMedia(form)
  if (result.error) return { ok: false, error: result.error }
  return { ok: true }
}

// Seals a photo, voice note, audio file or document the person picked, and sends it with its words as the caption.
export async function sendSealedMedia(input: SealedFileInput): Promise<SealedSend> {
  try {
    if (!isSealableMime(input.kind, input.mime)) return { ok: false, error: NOT_SEALABLE }
    if ([...input.body].length > MAX_DM) return { ok: false, error: TOO_LONG }
    const sealing = await readyToSeal(input.conversationId)
    if (!sealing.ok) return sealing
    const prepared = input.kind === "image" ? await stripPhoto(input.file) : { blob: input.file as Blob, mime: input.mime }
    if (!isSealableMime(input.kind, prepared.mime)) return { ok: false, error: NOT_SEALABLE }
    if (input.kind === "image" && prepared.blob.size > MAX_IMAGE_BYTES) return { ok: false, error: TOO_LARGE_PHOTO }
    const plain = await prepared.blob.arrayBuffer()
    return await sendSealedFile(
      {
        conversationId: input.conversationId,
        plain,
        media: input.kind,
        mime: prepared.mime,
        name: input.name,
        body: input.body,
        scan: input.scan,
        viewOnce: input.viewOnce,
        replyTo: input.replyTo,
        mentions: mentionedHandles(input.body),
        forwardOf: null,
      },
      sealing
    )
  } catch (error) {
    return { ok: false, error: error instanceof E2eeError ? error.message : SEND_FAILED }
  }
}

// A photo drawn again and encoded, so the place, camera and time details it carries are not sent. A GIF is sent as it is: drawing it
// again would keep only its first frame.
async function stripPhoto(file: File): Promise<{ blob: Blob; mime: string }> {
  if (file.type === "image/gif") return { blob: file, mime: "image/gif" }
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (!context) throw new E2eeError(PHOTO_FAILED)
    context.drawImage(bitmap, 0, 0)
    const wanted = file.type === "image/jpeg" || file.type === "image/webp" ? file.type : "image/png"
    // A browser that cannot write WebP gives PNG instead, and the type says so.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, wanted, 0.92))
    if (!blob) throw new E2eeError(PHOTO_FAILED)
    return { blob, mime: blob.type }
  } finally {
    bitmap.close()
  }
}

// The devices that have changed their signing key since this browser first saw them. A device's key is fixed when it is linked, so a
// change means the server has been given a different key for it, and its messages are not opened.
const changedSigners = new Set<string>()
const KEY_CHANGED = "A device in this chat has a different key from the one this browser saw before. Its messages aren't shown."

// The signing key of every device that has written in the chat, by device id, for checking an envelope against its writer, as this
// browser trusts it. A device seen for the first time is remembered with its key, so later changes are caught.
async function signingMap(conversationId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const device of await signingKeysOf(conversationId)) {
    const pinned = await pinnedSigningKey(device.device)
    if (pinned === null) {
      await pinSigningKey(device.device, device.signing)
      map.set(device.device, device.signing)
    } else if (pinned === device.signing) {
      map.set(device.device, device.signing)
    } else {
      changedSigners.add(device.device)
      map.set(device.device, pinned)
    }
  }
  return map
}

// Why a message did not open: its device's key changed, or the reason the device gave.
function failureOf(message: SealedInput, error: unknown): string {
  const sender = senderOf(message.envelope)
  if (sender !== null && changedSigners.has(sender)) return KEY_CHANGED
  return error instanceof E2eeError ? error.message : OPEN_FAILED
}

function senderOf(envelope: string): string | null {
  try {
    const parsed = JSON.parse(envelope) as { sender?: unknown }
    return typeof parsed.sender === "string" ? parsed.sender : null
  } catch {
    return null
  }
}

// The payload of a sealed message, opened with this device. Each envelope is checked against the device that signed it.
async function decryptPayload(conversationId: string, message: SealedInput, own: OwnDevice, signing: Map<string, string>): Promise<MessagePayload> {
  if (!message.wrap) throw new E2eeError(NOT_OPENED_HERE)
  const result = await decryptMessage({
    conversationId,
    messageId: message.id,
    raw: message.envelope,
    device: own.id,
    wrap: message.wrap,
    agreementPrivate: own.keys.agreementPrivate,
    senderSigning: (device) => signing.get(device) ?? null,
  })
  const payload = parsePayload(result.payload)
  if (!payload) throw new E2eeError(OPEN_FAILED)
  return payload
}

// Opens sealed messages with this browser's device. A message this device has no wrap for was sent before it could read the chat, and
// says so. A file's bytes are not opened here: they are fetched when shown.
export async function openSealed(conversationId: string, sealed: SealedInput[]): Promise<Record<string, OpenedMessage>> {
  const opened: Record<string, OpenedMessage> = {}
  if (sealed.length === 0) return opened
  // A message this browser sent is read from what it sealed. The others need this device, so a device that can't be read fails only those.
  let own: OwnDevice | null = null
  let ownError = OPEN_FAILED
  try {
    own = await readyDevice()
  } catch (error) {
    ownError = error instanceof E2eeError ? error.message : OPEN_FAILED
  }
  const signing = own ? await signingMap(conversationId) : new Map<string, string>()
  for (const message of sealed) {
    try {
      const sent = sentPayload(message.id, message.envelope)
      if (sent) {
        opened[message.id] = await openedFrom(conversationId, sent, message)
      } else if (own) {
        const payload = await decryptPayload(conversationId, message, own, signing)
        opened[message.id] = await openedFrom(conversationId, payload, message)
      } else {
        opened[message.id] = { ok: false, error: ownError }
      }
    } catch (error) {
      opened[message.id] = { ok: false, error: failureOf(message, error) }
    }
  }
  return opened
}

// What the thread shows for an opened payload. A contact's account is looked up here, so only someone in the chat is given it.
async function openedFrom(conversationId: string, payload: MessagePayload, message: SealedInput): Promise<OpenedMessage> {
  if (payload.kind === "text") return { ok: true, text: payload.body, attachment: null }
  if (payload.kind === "media") {
    if (!message.file) return { ok: false, error: OPEN_FAILED }
    const media: SealedMediaView = {
      file: message.file,
      media: payload.media,
      mime: payload.mime,
      name: payload.name,
      size: payload.size,
      key: payload.key,
      iv: payload.iv,
      scan: payload.scan,
      viewOnce: payload.viewOnce,
    }
    return { ok: true, text: payload.body, attachment: { kind: "media", media } }
  }
  if (payload.kind === "location") {
    return { ok: true, text: payload.body, attachment: { kind: "location", lat: payload.lat, lng: payload.lng } }
  }
  if (payload.kind === "contact") {
    return { ok: true, text: payload.body, attachment: { kind: "contact", user: await sealedContact(conversationId, payload.userId) } }
  }
  return {
    ok: true,
    text: payload.body,
    attachment: { kind: "poll", question: payload.question, options: payload.options, multiple: payload.multiple },
  }
}

// Opens the encrypted messages among some rows, with this browser's device, for an export or a search made here. A row that is not
// encrypted has no entry in the answer.
export async function openRows(
  conversationId: string,
  rows: Array<{ id: string; sealed: { envelope: string; wrap: Wrap | null; file: string | null } | null }>
): Promise<Record<string, OpenedMessage>> {
  const sealed = rows.flatMap((row) => (row.sealed ? [{ id: row.id, envelope: row.sealed.envelope, wrap: row.sealed.wrap, file: row.sealed.file }] : []))
  return openSealed(conversationId, sealed)
}

// The decrypted bytes of a sealed file, as a blob of the given type. The file is fetched under the same rules as any media (a
// view-once file only once it has been opened), and it is refused unless it opens for this message.
export async function openSealedFile(conversationId: string, messageId: string, media: SealedMediaView, type: string): Promise<Blob> {
  const response = await fetch(`/media/${media.file}`, { credentials: "same-origin", cache: "no-store" })
  if (!response.ok) throw new E2eeError("This file isn't here anymore.")
  const plain = await openFile(await response.arrayBuffer(), media.key, media.iv, conversationId, messageId)
  if (plain.byteLength !== media.size) throw new E2eeError(OPEN_FAILED)
  return new Blob([plain], { type })
}

// Changes the words of a sealed message this device sent, sealed again with the same message id. A file keeps its key and its bytes, so
// it is not sent again. A contact, a place and a poll keep what they are, so only their words could change, and those are left as sent.
export async function editSealedMessage(source: SealedSource, body: string): Promise<SealedSend> {
  try {
    if ([...body].length > MAX_DM) return { ok: false, error: TOO_LONG }
    const sealing = await readyToSeal(source.conversationId)
    if (!sealing.ok) return sealing
    const payload = await decryptPayload(source.conversationId, source, sealing.own, await signingMap(source.conversationId))
    if (payload.kind === "contact" || payload.kind === "location" || payload.kind === "poll") return { ok: false, error: WORDS_ONLY }
    const sealed = await encryptMessage({
      conversationId: source.conversationId,
      messageId: source.id,
      senderDevice: sealing.own.id,
      senderSigningPrivate: sealing.own.keys.signingPrivate,
      payload: { ...payload, body },
      recipients: sealing.recipients,
    })
    const result = await editEncryptedMessage(source.id, { envelope: sealed.envelope, wraps: sealed.wraps })
    if (!result.ok) return { ok: false, error: result.error }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof E2eeError ? error.message : SEND_FAILED }
  }
}

// Sends a sealed message on to other encrypted chats. Each copy is sealed for that chat's devices under its own message id, and is
// marked as forwarded. A text, photo, voice note, audio file, document, place or contact can go on; a poll and a view-once photo can't.
// Every chat is checked before any copy is sent, so a refusal sends nothing.
export async function forwardSealedMessage(source: SealedSource, targets: string[]): Promise<ForwardResult> {
  try {
    if (targets.length === 0) return { ok: false, error: NO_TARGET }
    const own = await readyDevice()
    const payload = await decryptPayload(source.conversationId, source, own, await signingMap(source.conversationId))
    if (payload.kind === "poll") return { ok: false, error: POLL_NOT_FORWARDABLE }
    if (payload.kind === "media" && payload.viewOnce) return { ok: false, error: VIEW_ONCE_NOT_FORWARDABLE }
    const sealings: SealingOk[] = []
    for (const target of targets) {
      const sealing = await readyToSeal(target)
      if (!sealing.ok) return { ok: false, error: sealing.error }
      if (payload.kind === "contact" && !(await sealedContact(target, payload.userId))) return { ok: false, error: CONTACT_ELSEWHERE }
      sealings.push(sealing)
    }
    let plain: ArrayBuffer | null = null
    if (payload.kind === "media") {
      if (!source.file) return { ok: false, error: OPEN_FAILED }
      const media: SealedMediaView = {
        file: source.file,
        media: payload.media,
        mime: payload.mime,
        name: payload.name,
        size: payload.size,
        key: payload.key,
        iv: payload.iv,
        scan: payload.scan,
        viewOnce: payload.viewOnce,
      }
      plain = await (await openSealedFile(source.conversationId, source.id, media, payload.mime)).arrayBuffer()
    }
    for (const [index, target] of targets.entries()) {
      const result =
        payload.kind === "media" && plain
          ? await sendSealedFile(
              {
                conversationId: target,
                plain,
                media: payload.media,
                mime: payload.mime,
                name: payload.name,
                body: payload.body,
                scan: payload.scan,
                viewOnce: false,
                replyTo: null,
                mentions: [],
                forwardOf: source.id,
              },
              sealings[index]
            )
          : await sendSealedPayload(target, payload, { replyTo: null, mentions: [], poll: null, forwardOf: source.id })
      if (!result.ok) return { ok: false, error: result.error }
    }
    return { ok: true, count: targets.length }
  } catch (error) {
    return { ok: false, error: error instanceof E2eeError ? error.message : SEND_FAILED }
  }
}
