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

// One open tab of one person. Every tab is its own device in a call, so signals can go to the one tab taking part.
export type CallPeerRef = { userId: string; deviceId: string }

// Someone in a group call. A higher seq joined later, and the later joiner always makes the offer.
export type GroupMember = { userId: string; deviceId: string; seq: number; person: EventPerson }

// Why a call ended, so each side can say so in plain words.
export type CallEndReason =
  | "ended"
  | "missed"
  | "declined"
  | "failed"
  | "dropped"
  | "nobody"
  | "signed-out"
  | "deactivated"
  | "deleted"
  | "left"
  | "removed"
  | "moved"
  | "blocked"

// Steps of a call relayed between people. The server adds the ring, the group's state and how a call ended.
export type CallSignal =
  // A ring. The servers in it are for the person rung alone. A group ring carries the group's name.
  | { kind: "ring"; call: "dm" | "group"; conversationId: string; from: EventPerson; title: string | null; iceServers: IceServerConfig[] }
  | { kind: "accept" }
  // Sent to all of a person's tabs when one of them answers or joins. The others stop ringing.
  | { kind: "claimed"; device: string }
  | { kind: "decline" }
  | { kind: "end"; reason: CallEndReason; seconds: number }
  | { kind: "offer"; sdp: string; restart: boolean; from: CallPeerRef; person: EventPerson | null }
  | { kind: "answer"; sdp: string; from: CallPeerRef }
  | { kind: "ice"; candidate: IceCandidateJson; from: CallPeerRef }
  // Who is in a group call, sent to every member whenever it changes. Quiet means the member muted the group.
  | { kind: "group"; conversationId: string; title: string; live: boolean; members: GroupMember[]; quiet: boolean }

// The steps a browser sends. In a group call, offers, answers and routes name the device they are for.
export type CallAction =
  | { kind: "accept" }
  | { kind: "decline" }
  | { kind: "end"; lostMs?: number }
  | { kind: "connected" }
  | { kind: "offer"; to: CallPeerRef | null; sdp: string; restart: boolean }
  | { kind: "answer"; to: CallPeerRef | null; sdp: string }
  | { kind: "ice"; to: CallPeerRef | null; candidate: IceCandidateJson }

export type RealtimeEvent =
  // The first event on every stream. The boot id changes when the server restarts.
  | { type: "hello"; bootId: string }
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
  // A call step. With a device, only that tab acts on it.
  | { type: "call"; callId: string; signal: CallSignal; device?: string }

export function publish(userIds: string[], event: RealtimeEvent): void {
  for (const id of new Set(userIds)) bus.emit(`user:${id}`, event)
}

export function subscribe(userId: string, listener: (event: RealtimeEvent) => void): () => void {
  const key = `user:${userId}`
  bus.on(key, listener)
  return () => bus.off(key, listener)
}

// How many event streams a person has open right now. Zero means nothing of theirs can ring.
export function listenerCount(userId: string): number {
  return bus.listenerCount(`user:${userId}`)
}
