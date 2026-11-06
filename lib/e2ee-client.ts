// The browser side of encrypted chats: this browser's device, sealing a text message, and opening the sealed messages a thread shows.
// The cryptography is in lib/e2ee.ts and the keys stay in lib/e2ee-keystore.ts. The server only sees envelopes, wraps and public
// keys. Browser only.

import { decryptMessage, E2eeError, encryptMessage, generateDeviceKeys, type DeviceKeys, type Wrap } from "@/lib/e2ee"
import { loadDeviceKeys, saveDeviceKeys } from "@/lib/e2ee-keystore"
import { parsePayload } from "@/lib/e2ee-chat"
import { mentionedHandles } from "@/lib/chat-message-rules"
import { setUpThisDevice, thisDevice } from "@/actions/e2ee"
import { encryptionTargets, sendEncryptedMessage, signingKeysOf } from "@/actions/messages"

const UNSUPPORTED = "This browser can't encrypt messages here. Open Rhenko over HTTPS in a current browser."
const SEND_FAILED = "That message couldn't be sent. Try again."
const OPEN_FAILED = "This message couldn't be opened on this device."

export type SealedSend = { ok: true } | { ok: false; error: string }
export type OpenedText = { ok: true; text: string } | { ok: false; error: string }
export type SealedInput = { id: string; envelope: string; wrap: Wrap | null }

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

// Seals a text message for every device in the chat and sends it. The message id is picked here, because it is bound into the
// encryption. Attachments are not sealed yet, so the caller sends text only.
export async function sendSealedText(input: { conversationId: string; body: string; replyTo: string | null }): Promise<SealedSend> {
  try {
    const own = await readyDevice()
    const targets = await encryptionTargets(input.conversationId)
    if (!targets.ok) return { ok: false, error: targets.error }
    if (targets.memberWithoutDevice) {
      return { ok: false, error: "Someone in this chat hasn't turned on encrypted messages yet, so this message can't be sent." }
    }
    if (targets.viewerDevice !== own.id) {
      return { ok: false, error: "This browser's keys no longer match your account. Reload and try again." }
    }
    const messageId = crypto.randomUUID()
    const sealed = await encryptMessage({
      conversationId: input.conversationId,
      messageId,
      senderDevice: own.id,
      senderSigningPrivate: own.keys.signingPrivate,
      payload: { kind: "text", body: input.body },
      recipients: targets.recipients,
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

// Opens sealed messages with this browser's device. Each one is checked against the device that signed it. A message this device has
// no wrap for was sent before it could read the chat, and says so.
export async function openSealed(conversationId: string, sealed: SealedInput[]): Promise<Record<string, OpenedText>> {
  const opened: Record<string, OpenedText> = {}
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
      const payload = parsePayload(result.payload)
      opened[message.id] = payload ? { ok: true, text: payload.body } : { ok: false, error: OPEN_FAILED }
    } catch (error) {
      opened[message.id] = { ok: false, error: error instanceof E2eeError ? error.message : OPEN_FAILED }
    }
  }
  return opened
}
