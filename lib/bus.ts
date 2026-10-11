import { EventEmitter } from "node:events"

// In-process event bus. Server actions publish here and the /api/events
// stream forwards events to each user's open tabs. Single-server only: an app
// running on several instances would need a shared broker.
type Globals = { __rhenkoBus?: EventEmitter }
const globals = globalThis as unknown as Globals

const bus: EventEmitter = globals.__rhenkoBus ?? new EventEmitter()
bus.setMaxListeners(0)
globals.__rhenkoBus = bus

// Plain fields only: events travel to the browser as JSON.
export type EventPerson = { id: string; name: string; handle: string; avatarFile: string | null }

// What a banner is about. Notification kinds match the notifications page.
export type BannerKind =
  | "message"
  | "request"
  | "missed-call"
  | "like"
  | "repost"
  | "reply"
  | "quote"
  | "follow"
  | "mention"
  | "follow_request"
  | "poll"
  | "post"

export type IceCandidateJson = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }
export type IceServerConfig = { urls: string | string[]; username?: string; credential?: string }

// Steps of a call relayed to the other person. The server adds ring and the outcome of a call.
export type CallSignal =
  | { kind: "ring"; conversationId: string; from: EventPerson; iceServers: IceServerConfig[] }
  | { kind: "accept" }
  // Sent to the person's own devices when one of them answers, so the others stop ringing.
  | { kind: "claimed" }
  | { kind: "decline" }
  | { kind: "end"; reason: "ended" | "missed"; seconds: number }
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: IceCandidateJson }

export type RealtimeEvent =
  | { type: "notification" }
  | { type: "message"; conversationId: string }
  | { type: "typing"; conversationId: string; name: string }
  | {
      type: "banner"
      kind: BannerKind
      conversationId: string | null
      title: string
      line: string
      preview: string | null
      href: string
      from: EventPerson
    }
  | { type: "call"; callId: string; signal: CallSignal }

export function publish(userIds: string[], event: RealtimeEvent): void {
  for (const id of new Set(userIds)) bus.emit(`user:${id}`, event)
}

export function subscribe(userId: string, listener: (event: RealtimeEvent) => void): () => void {
  const key = `user:${userId}`
  bus.on(key, listener)
  return () => bus.off(key, listener)
}
