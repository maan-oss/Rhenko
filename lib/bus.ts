import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { all, get, listen, run, transaction } from "@/lib/db"
import { WORKER_ID } from "@/lib/worker"

// The event bus. Server actions publish an event for the people it concerns, and the /api/events stream of each open tab
// receives it. Several server processes serve one port, so a tab may be connected to any of them. A published event is
// written to the events table, and Postgres tells every process about it with a NOTIFY (see db/postgres/schema.sql). Each
// process then reads the events it has not passed on yet and hands them to the tabs it holds. A stream is recorded in the
// database too, so any process can tell whether a person has a tab open anywhere.

// A process reads new events as soon as Postgres says there are some, so a tab hears of an event in milliseconds. The
// timer below only catches what a missed notification would have left behind.
const EVENTS_CHANNEL = "rhenko_events"
const FALLBACK_POLL_MS = 1_000
// A process checks in on its streams this often. A stream its process has not checked in on for STREAM_STALE_MS is gone.
const CHECK_IN_MS = 10_000
const STREAM_STALE_MS = 60_000
// Events are kept this long. Every process has read them well before then.
const EVENT_KEEP_MS = 60_000
const READ_BATCH = 500

type Poller = { cursor: number; checkedInAt: number; timer: ReturnType<typeof setInterval> }
type Globals = { __rhenkoBus?: EventEmitter; __rhenkoBusPoller?: Poller }
const globals = globalThis as unknown as Globals

// Tabs held by this process, by person. Filled from the events table as they are read.
const local: EventEmitter = globals.__rhenkoBus ?? new EventEmitter()
local.setMaxListeners(0)
globals.__rhenkoBus = local

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
  // A video call rings with video set. Group calls are voice only.
  | { kind: "ring"; call: "dm" | "group"; conversationId: string; from: EventPerson; title: string | null; iceServers: IceServerConfig[]; video?: boolean }
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
  // A post from someone the person follows. The Following feed shows a pill for it. Nothing reloads.
  | { type: "posts"; postId: string }

// Sends an event to the open tabs of each person in `userIds`. People with no tab open anywhere get nothing written.
export async function publish(userIds: string[], event: RealtimeEvent): Promise<void> {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return
  const open = await all<{ user_id: string }>(
    `SELECT DISTINCT user_id FROM streams WHERE seen_at > ? AND user_id IN (${ids.map(() => "?").join(", ")})`,
    Date.now() - STREAM_STALE_MS,
    ...ids
  )
  if (open.length === 0) return
  const payload = JSON.stringify(event)
  const now = Date.now()
  await transaction(async () => {
    for (const row of open) await run("INSERT INTO events (user_id, payload, created_at) VALUES (?, ?, ?)", row.user_id, payload, now)
  })
}

// Starts a stream for a person in this process. The returned function ends it.
export async function subscribe(userId: string, listener: (event: RealtimeEvent) => void): Promise<() => void> {
  const key = `user:${userId}`
  const streamId = randomUUID()
  await run("INSERT INTO streams (id, user_id, worker, seen_at) VALUES (?, ?, ?, ?)", streamId, userId, WORKER_ID, Date.now())
  local.on(key, listener)
  await startPoller()
  let open = true
  return async () => {
    if (!open) return
    open = false
    local.off(key, listener)
    await run("DELETE FROM streams WHERE id = ?", streamId)
  }
}

// How many event streams a person has open right now, in any process. Zero means nothing of theirs can ring.
export async function listenerCount(userId: string): Promise<number> {
  return (await get<{ n: number }>("SELECT COUNT(*) AS n FROM streams WHERE user_id = ? AND seen_at > ?", userId, Date.now() - STREAM_STALE_MS))?.n ?? 0
}

// Starts the loop that hands events to this process's tabs. It begins after the newest event, so a tab never receives
// events from before it connected.
// Two tabs starting at once share one start, so a process never runs two readers that would hand out the same event twice.
let starting: Promise<void> | null = null
async function startPoller(): Promise<void> {
  if (globals.__rhenkoBusPoller) return
  if (!starting) starting = beginPolling().finally(() => (starting = null))
  await starting
}

async function beginPolling(): Promise<void> {
  const latest = await get<{ id: number }>("SELECT COALESCE(MAX(id), 0) AS id FROM events")
  if (globals.__rhenkoBusPoller) return
  const poller: Poller = {
    cursor: latest?.id ?? 0,
    checkedInAt: Date.now(),
    timer: setInterval(pollSoon, FALLBACK_POLL_MS),
  }
  poller.timer.unref?.()
  globals.__rhenkoBusPoller = poller
  listen(EVENTS_CHANNEL, pollSoon).catch((error) => console.error("[bus] listening for events failed; checking every second instead", error))
}

// Reads new events now. A call that comes while a read is running is joined into one more read after it, so two reads
// never overlap, and no event is handed to a tab twice.
let reading: Promise<void> | null = null
let readAgain = false
function pollSoon(): void {
  if (reading) {
    readAgain = true
    return
  }
  reading = (async () => {
    do {
      readAgain = false
      try {
        await pollOnce()
      } catch (error) {
        console.error("[bus] reading events failed", error)
      }
    } while (readAgain)
    reading = null
  })()
}

async function pollOnce(): Promise<void> {
  const poller = globals.__rhenkoBusPoller
  if (!poller) return
  for (;;) {
    const rows = await all<{ id: number; user_id: string; payload: string }>(
      "SELECT id, user_id, payload FROM events WHERE id > ? ORDER BY id LIMIT ?",
      poller.cursor,
      READ_BATCH
    )
    for (const row of rows) {
      poller.cursor = row.id
      const key = `user:${row.user_id}`
      if (local.listenerCount(key) === 0) continue
      const event = JSON.parse(row.payload) as RealtimeEvent
      for (const listener of local.listeners(key)) {
        try {
          ;(listener as (event: RealtimeEvent) => void)(event)
        } catch (error) {
          console.error("[bus] a stream failed to take an event", error)
        }
      }
    }
    if (rows.length < READ_BATCH) break
  }
  const now = Date.now()
  if (now - poller.checkedInAt >= CHECK_IN_MS) {
    poller.checkedInAt = now
    await run("UPDATE streams SET seen_at = ? WHERE worker = ?", now, WORKER_ID)
  }
}

// Removes streams whose process stopped checking in, and events everyone has read. Runs from the maintenance pass.
export async function sweepBus(now = Date.now()): Promise<void> {
  await run("DELETE FROM streams WHERE seen_at <= ?", now - STREAM_STALE_MS)
  await run("DELETE FROM events WHERE created_at <= ?", now - EVENT_KEEP_MS)
}
