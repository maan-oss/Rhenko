// The browser side of encrypted chats: this browser's device, sealing a message or a file, and opening the sealed messages a thread
// shows. The cryptography is in lib/e2ee.ts and lib/e2ee-media.ts, and the keys stay in lib/e2ee-keystore.ts. The server only sees
// envelopes, wraps, public keys and the encrypted bytes of a file. Browser only.

import { decryptMessage, E2eeError, encryptMessage, generateDeviceKeys, type DeviceKeys, type Recipient, type Wrap } from "@/lib/e2ee"
import { openFile, sealFile } from "@/lib/e2ee-media"
import { loadDeviceKeys, saveDeviceKeys } from "@/lib/e2ee-keystore"
import {
  isSealableMime,
  parsePayload,
  type MessagePayload,
  type SealedMediaKind,
  type SealedMediaView,
} from "@/lib/e2ee-chat"
import { mentionedHandles } from "@/lib/chat-message-rules"
import { MAX_DM, MAX_IMAGE_BYTES } from "@/lib/rules"
import { setUpThisDevice, thisDevice } from "@/actions/e2ee"
import { encryptionTargets, sendEncryptedMedia, sendEncryptedMessage, signingKeysOf } from "@/actions/messages"

const UNSUPPORTED = "This browser can't encrypt messages here. Open Rhenko over HTTPS in a current browser."
const SEND_FAILED = "That message couldn't be sent. Try again."
const OPEN_FAILED = "This message couldn't be opened on this device."
const PHOTO_FAILED = "That photo couldn't be prepared. Try another."
const NOT_SEALABLE = "That kind of file can't be sent in an encrypted chat."
const TOO_LARGE_PHOTO = "That picture is too large to send. Choose a smaller one."
const TOO_LONG = "Messages can have up to 1000 characters."

export type SealedSend = { ok: true } | { ok: false; error: string }
// A message as this device reads it: its text, and the file in it when it has one.
export type OpenedMessage = { ok: true; text: string; media: SealedMediaView | null } | { ok: false; error: string }
export type SealedInput = { id: string; envelope: string; wrap: Wrap | null; file: string | null }

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

// Seals a text message for every device in the chat and sends it. The message id is picked here, because it is bound into the
// encryption.
export async function sendSealedText(input: { conversationId: string; body: string; replyTo: string | null }): Promise<SealedSend> {
  try {
    const sealing = await readyToSeal(input.conversationId)
    if (!sealing.ok) return sealing
    const messageId = crypto.randomUUID()
    const sealed = await encryptMessage({
      conversationId: input.conversationId,
      messageId,
      senderDevice: sealing.own.id,
      senderSigningPrivate: sealing.own.keys.signingPrivate,
      payload: { kind: "text", body: input.body },
      recipients: sealing.recipients,
    })
    const result = await sendEncryptedMessage({
      conversationId: input.conversationId,
      id: messageId,
      envelope: sealed.envelope,
      wraps: sealed.wraps,
      replyTo: input.replyTo,
      mentions: mentionedHandles(input.body),
    })
    if (result.error) return { ok: false, error: result.error }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof E2eeError ? error.message : SEND_FAILED }
  }
}

// Seals a photo, voice note, audio file or document: the file's bytes are encrypted under their own key, and the key goes into the
// message's payload, so the server stores only ciphertext. The file is uploaded together with the message, so a refused message
// leaves no file behind.
export async function sendSealedMedia(input: SealedFileInput): Promise<SealedSend> {
  try {
    if (!isSealableMime(input.kind, input.mime)) return { ok: false, error: NOT_SEALABLE }
    if ([...input.body].length > MAX_DM) return { ok: false, error: TOO_LONG }
    const sealing = await readyToSeal(input.conversationId)
    if (!sealing.ok) return sealing
    const messageId = crypto.randomUUID()
    const prepared = input.kind === "image" ? await stripPhoto(input.file) : { blob: input.file as Blob, mime: input.mime }
    if (!isSealableMime(input.kind, prepared.mime)) return { ok: false, error: NOT_SEALABLE }
    if (input.kind === "image" && prepared.blob.size > MAX_IMAGE_BYTES) return { ok: false, error: TOO_LARGE_PHOTO }
    const plain = await prepared.blob.arrayBuffer()
    const file = await sealFile(plain, input.conversationId, messageId)
    const sealed = await encryptMessage({
      conversationId: input.conversationId,
      messageId,
      senderDevice: sealing.own.id,
      senderSigningPrivate: sealing.own.keys.signingPrivate,
      payload: {
        kind: "media",
        body: input.body,
        media: input.kind,
        mime: prepared.mime,
        name: input.name,
        size: plain.byteLength,
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
    form.append("mentions", JSON.stringify(mentionedHandles(input.body)))
    form.append("viewOnce", input.viewOnce ? "on" : "")
    form.append("media", new Blob([file.bytes], { type: "application/octet-stream" }), "media")
    const result = await sendEncryptedMedia(form)
    if (result.error) return { ok: false, error: result.error }
    return { ok: true }
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

// Opens sealed messages with this browser's device. Each one is checked against the device that signed it. A message this device has
// no wrap for was sent before it could read the chat, and says so. A file's bytes are not opened here: they are fetched when shown.
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
  const signing = new Map((await signingKeysOf(conversationId)).map((device) => [device.device, device.signing]))
  for (const message of sealed) {
    if (!message.wrap) {
      opened[message.id] = { ok: false, error: "Sent before this device could read the chat." }
      continue
    }
    try {
      const result = await decryptMessage({
        conversationId,
        messageId: message.id,
        raw: message.envelope,
        device: own.id,
        wrap: message.wrap,
        agreementPrivate: own.keys.agreementPrivate,
        senderSigning: (device) => signing.get(device) ?? null,
      })
      opened[message.id] = openedFrom(parsePayload(result.payload), message)
    } catch (error) {
      opened[message.id] = { ok: false, error: error instanceof E2eeError ? error.message : OPEN_FAILED }
    }
  }
  return opened
}

function openedFrom(payload: MessagePayload | null, message: SealedInput): OpenedMessage {
  if (!payload) return { ok: false, error: OPEN_FAILED }
  if (payload.kind === "text") return { ok: true, text: payload.body, media: null }
  if (!message.file) return { ok: false, error: OPEN_FAILED }
  return {
    ok: true,
    text: payload.body,
    media: {
      file: message.file,
      media: payload.media,
      mime: payload.mime,
      name: payload.name,
      size: payload.size,
      key: payload.key,
      iv: payload.iv,
      scan: payload.scan,
      viewOnce: payload.viewOnce,
    },
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
