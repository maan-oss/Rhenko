// The browser side of encrypted chats: this browser's device, and sealing, sending, editing and forwarding the messages of a chat, and
// opening the sealed messages a thread shows. The cryptography is in lib/e2ee.ts and lib/e2ee-media.ts, and the keys stay in
// lib/e2ee-keystore.ts. The server only sees envelopes, wraps, public keys, the encrypted bytes of a file, and the ids of a poll's
// choices. Browser only.

import { decryptMessage, E2eeError, encryptMessage, generateDeviceKeys, type DeviceKeys, type Recipient, type Wrap } from "@/lib/e2ee"
import { openFile, sealFile } from "@/lib/e2ee-media"
import { loadDeviceKeys, saveDeviceKeys } from "@/lib/e2ee-keystore"
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
import { setUpThisDevice, thisDevice } from "@/actions/e2ee"
import {
  editEncryptedMessage,
  encryptionTargets,
  sealedContact,
  sendEncryptedMedia,
  sendEncryptedMessage,
  signingKeysOf,
} from "@/actions/messages"

const UNSUPPORTED = "This browser can't encrypt messages here. Open Rhenko over HTTPS in a current browser."
const SEND_FAILED = "That message couldn't be sent. Try again."
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
  if (!setup.ok) throw new E2eeError(setup.error)
  await saveDeviceKeys(setup.deviceId, keys)
  return { id: setup.deviceId, keys }
}

function browserLabel(): string {
  const platform = typeof navigator !== "undefined" && navigator.platform ? navigator.platform : "browser"
  return `Browser on ${platform}`
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
    const result = await sendEncryptedMessage({
      conversationId,
      id: messageId,
      envelope: sealed.envelope,
      wraps: sealed.wraps,
      replyTo: options.replyTo,
      mentions: options.mentions,
      poll: options.poll,
      forwardOf: options.forwardOf,
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
  const sealed = await encryptMessage({
    conversationId: input.conversationId,
    messageId,
    senderDevice: sealing.own.id,
    senderSigningPrivate: sealing.own.keys.signingPrivate,
    payload: {
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
    },
    recipients: sealing.recipients,
  })
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

// The signing key of every device that has written in the chat, by device id, for checking an envelope against its writer.
async function signingMap(conversationId: string): Promise<Map<string, string>> {
  return new Map((await signingKeysOf(conversationId)).map((device) => [device.device, device.signing]))
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
  let own: OwnDevice
  try {
    own = await readyDevice()
  } catch (error) {
    const reason = error instanceof E2eeError ? error.message : OPEN_FAILED
    for (const message of sealed) opened[message.id] = { ok: false, error: reason }
    return opened
  }
  const signing = await signingMap(conversationId)
  for (const message of sealed) {
    try {
      const payload = await decryptPayload(conversationId, message, own, signing)
      opened[message.id] = await openedFrom(conversationId, payload, message)
    } catch (error) {
      opened[message.id] = { ok: false, error: error instanceof E2eeError ? error.message : OPEN_FAILED }
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
