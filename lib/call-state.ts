import { randomUUID } from "node:crypto"
import { all, get, run, transaction } from "@/lib/db"
import {
  listenerCount,
  publish,
  type CallAction,
  type CallEndReason,
  type CallSignal,
  type EventPerson,
  type GroupMember,
  type IceServerConfig,
  type RealtimeEvent,
} from "@/lib/bus"
import { CALL_RECONNECT_MS, CALL_RESTART_WAIT_MS, CALL_STALE_MS, GROUP_CALL_MAX } from "@/lib/call-rules"
import type { CallOutcome } from "@/lib/format"
import { iceServersFor } from "@/lib/ice"
import { blockedEitherWay } from "@/lib/notify"
import { CALL_RING_MS } from "@/lib/rules"

// Live calls: who is ringing, who is talking, and from which tab. Several server processes serve the calls, and a tab may
// be connected to any of them, so the state lives in the database. Each call is one row that holds the call as a document.
// An operation reads the calls it needs, changes them in memory, and writes back what changed, all in one transaction. So
// two processes never change the same call at once. Each call leaves one record in its conversation when it ends.
//
// A ring has a deadline (ringUntil). The maintenance pass checks the deadlines every second, so a ring ends on time.
// Every event stream opens with the boot id, so a browser can tell a restart apart from a dropped connection.

// One tab taking part in a call. The session is the hash of the sign-in it runs under, so a sign-out on one browser
// can end only the call running there.
export type Device = { userId: string; deviceId: string; session: string | null }

type DmCall = {
  kind: "dm"
  id: string
  conversationId: string
  // A video call. The ring says so, and the person who answers sends a picture if they have a camera.
  video: boolean
  caller: Device
  calleeId: string
  // The tab that answered. Until then every tab of the person called rings.
  callee: Device | null
  startedAt: number
  answeredAt: number | null
  connectedAt: number | null
  // When an unanswered ring stops. Null once it is answered or the call has ended.
  ringUntil: number | null
  beats: Map<string, number>
}

type Participant = Device & { seq: number; person: EventPerson; beat: number }

type GroupCall = {
  kind: "group"
  id: string
  conversationId: string
  starterId: string
  startedAt: number
  // When the rings stop. Null once they have stopped.
  ringUntil: number | null
  seq: number
  participants: Map<string, Participant>
  // Everyone who took part at some point, everyone rung, and who is ringing now.
  joined: Set<string>
  rung: Set<string>
  ringing: Set<string>
  connectedAt: number | null
  // Time counts only while two or more people are in the call after it first connected.
  togetherSince: number | null
  togetherMs: number
}

type Call = DmCall | GroupCall
type BannerEvent = Extract<RealtimeEvent, { type: "banner" }>

// Set once per server run. The cluster master gives every process of the run the same id.
type Globals = { __rhenkoBootId?: string }
const globals = globalThis as unknown as Globals
const BOOT_ID: string = (globals.__rhenkoBootId ??= process.env.RHENKO_BOOT_ID || randomUUID())

export type HangUpReason = "signed-out" | "deactivated" | "deleted" | "blocked"

export type StartResult =
  | { ok: true; mode: "ringing"; callId: string; iceServers: IceServerConfig[]; bootId: string }
  | { ok: true; mode: "answered"; callId: string; iceServers: IceServerConfig[]; bootId: string; peer: EventPerson }
  | { ok: false; error: string; unavailable?: boolean }

export type JoinResult =
  | {
      ok: true
      callId: string
      conversationId: string
      iceServers: IceServerConfig[]
      bootId: string
      seq: number
      // Everyone already in the call, oldest first. The new joiner sends each of them an offer.
      members: GroupMember[]
      title: string
    }
  | { ok: false; error: string }

export type SignalResult = { ok: true } | { ok: false; error: string }

const GONE = "That call has ended."
const OK: SignalResult = { ok: true }
// A dropped call is counted up to when it dropped, but no further back than the reconnect window.
const MAX_LOST_MS = CALL_RECONNECT_MS + CALL_RESTART_WAIT_MS + 5_000
const BANNER_KEEP_MS = 12 * 60 * 60 * 1000
const BANNERS_KEPT = 5

// The calls one operation works on. Each is read from the database once, and written back at the end if it changed.
type Working = {
  entries: Map<string, { call: Call; doc: string | null }>
  removed: Set<string>
}
let working: Working | null = null

// Set once when the server run starts.
export function serverBootId(): string {
  return BOOT_ID
}

export function personOf(userId: string): EventPerson | null {
  const row = get<{ id: string; name: string; handle: string; avatar_file: string | null }>(
    "SELECT id, name, handle, avatar_file FROM users WHERE id = ? AND deactivated_at IS NULL",
    userId
  )
  return row ? { id: row.id, name: row.name, handle: row.handle, avatarFile: row.avatar_file } : null
}

// Which kind of call an id names, and where, for the checks the server actions make before acting on it.
export function callInfo(callId: string): { kind: "dm" | "group"; conversationId: string } | null {
  const row = get<{ kind: "dm" | "group"; conversation_id: string }>("SELECT kind, conversation_id FROM calls WHERE id = ?", callId)
  return row ? { kind: row.kind, conversationId: row.conversation_id } : null
}

function encode(call: Call): string {
  return JSON.stringify(call, (_key, value: unknown) => {
    if (value instanceof Map) return { $map: [...value.entries()] }
    if (value instanceof Set) return { $set: [...value] }
    return value
  })
}

function decode(doc: string): Call {
  return JSON.parse(doc, (_key, value: unknown) => {
    if (value && typeof value === "object") {
      if ("$map" in value) return new Map((value as { $map: [unknown, unknown][] }).$map)
      if ("$set" in value) return new Set((value as { $set: unknown[] }).$set)
    }
    return value
  }) as Call
}

function openWork(): Working {
  if (!working) throw new Error("Calls are changed only inside a call operation.")
  return working
}

// Runs one operation on the calls. A write runs in a transaction and saves what it changed. A read takes no lock. An
// operation started inside another one joins it.
function operate<T>(writes: boolean, fn: () => T): T {
  if (working) return fn()
  const body = (): T => {
    const state: Working = { entries: new Map(), removed: new Set() }
    working = state
    try {
      const result = fn()
      if (writes) saveCalls(state)
      return result
    } finally {
      working = null
    }
  }
  return writes ? transaction(body) : body()
}

function saveCalls(state: Working): void {
  for (const id of state.removed) run("DELETE FROM calls WHERE id = ?", id)
  for (const [id, entry] of state.entries) {
    const doc = encode(entry.call)
    if (doc === entry.doc) continue
    run(
      "INSERT INTO calls (id, kind, conversation_id, doc) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc",
      id,
      entry.call.kind,
      entry.call.conversationId,
      doc
    )
  }
}

function getCall(id: string): Call | null {
  const state = openWork()
  const known = state.entries.get(id)
  if (known) return known.call
  if (state.removed.has(id)) return null
  const row = get<{ doc: string }>("SELECT doc FROM calls WHERE id = ?", id)
  if (!row) return null
  const call = decode(row.doc)
  state.entries.set(id, { call, doc: row.doc })
  return call
}

function listCalls(): Call[] {
  const state = openWork()
  for (const row of all<{ id: string; doc: string }>("SELECT id, doc FROM calls")) {
    if (state.entries.has(row.id) || state.removed.has(row.id)) continue
    state.entries.set(row.id, { call: decode(row.doc), doc: row.doc })
  }
  return [...state.entries.values()].map((entry) => entry.call)
}

// Whether a call, as this operation holds it, has not ended yet.
function alive(call: Call): boolean {
  return openWork().entries.get(call.id)?.call === call
}

function createCall(call: Call): void {
  const state = openWork()
  state.removed.delete(call.id)
  state.entries.set(call.id, { call, doc: null })
}

function endCall(call: Call): void {
  const state = openWork()
  state.entries.delete(call.id)
  state.removed.add(call.id)
}

function anyCalls(): boolean {
  return get("SELECT 1 AS found FROM calls LIMIT 1") !== undefined
}

function relay(userId: string, callId: string, signal: CallSignal, device?: string): void {
  publish([userId], device ? { type: "call", callId, signal, device } : { type: "call", callId, signal })
}

// Accepted members of a conversation whose accounts are live.
function acceptedMembers(conversationId: string): { user_id: string; muted: number }[] {
  return all<{ user_id: string; muted: number }>(
    `SELECT cm.user_id, cm.muted FROM conversation_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ? AND cm.status = 'accepted' AND u.deactivated_at IS NULL`,
    conversationId
  )
}

// Whether a member muted the conversation. Null when they are not an accepted member.
function memberMuted(conversationId: string, userId: string): boolean | null {
  const row = get<{ muted: number }>(
    "SELECT muted FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND status = 'accepted'",
    conversationId,
    userId
  )
  return row ? row.muted === 1 : null
}

// A group's name as one member sees it: its title, or the other members' names.
function groupTitle(conversationId: string, viewerId: string): string {
  const title = get<{ title: string }>("SELECT title FROM conversations WHERE id = ?", conversationId)?.title ?? ""
  if (title) return title
  const names = all<{ name: string }>(
    `SELECT u.name FROM conversation_members cm JOIN users u ON u.id = cm.user_id
     WHERE cm.conversation_id = ? AND cm.user_id <> ? AND u.deactivated_at IS NULL ORDER BY cm.joined_at LIMIT 4`,
    conversationId,
    viewerId
  ).map((row) => row.name)
  if (names.length === 0) return "Group call"
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} and others` : names.join(", ")
}

// Talking or ringing out counts as talking. Being rung counts as ringing.
function busyState(userId: string, except?: string): "talking" | "ringing" | null {
  let ringing = false
  for (const call of listCalls()) {
    if (call.id === except) continue
    if (call.kind === "dm") {
      if (call.caller.userId === userId) return "talking"
      if (call.calleeId === userId) {
        if (call.answeredAt !== null) return "talking"
        ringing = true
      }
    } else {
      if (call.participants.has(userId)) return "talking"
      if (call.ringing.has(userId)) ringing = true
    }
  }
  return ringing ? "ringing" : null
}

function blockedWithAnyone(call: GroupCall, userId: string): boolean {
  for (const other of call.participants.keys()) {
    if (other !== userId && blockedEitherWay(other, userId)) return true
  }
  return false
}

// The call's record in its conversation. The sender is the first of the candidates whose account still exists, and
// nothing is written for a conversation that is gone.
function writeRecord(call: Call, outcome: CallOutcome, seconds: number, people: number, senders: string[]): void {
  const now = Date.now()
  if (!get("SELECT 1 AS found FROM conversations WHERE id = ?", call.conversationId)) return
  const sender = senders.find((id) => get("SELECT 1 AS found FROM users WHERE id = ?", id) !== undefined)
  if (!sender) return
  try {
    run(
      `INSERT INTO chat_messages (id, conversation_id, sender_id, body, call_status, call_seconds, call_kind, call_people, created_at)
       VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)`,
      randomUUID(),
      call.conversationId,
      sender,
      outcome,
      Math.max(0, Math.round(seconds)),
      call.kind,
      people,
      now
    )
    run("UPDATE conversations SET updated_at = ? WHERE id = ?", now, call.conversationId)
  } catch (error) {
    console.error("[calls] the call record could not be saved", error)
    return
  }
  const members = all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", call.conversationId)
  publish(
    members.map((member) => member.user_id),
    { type: "message", conversationId: call.conversationId }
  )
}

// A banner goes to every open tab. Someone with none open gets it when they next open the app.
function deliverBanner(userId: string, event: BannerEvent): void {
  if (listenerCount(userId) > 0) {
    publish([userId], event)
    return
  }
  run("INSERT INTO queued_banners (user_id, event, created_at) VALUES (?, ?, ?)", userId, JSON.stringify(event), Date.now())
  run(
    "DELETE FROM queued_banners WHERE user_id = ?1 AND id NOT IN (SELECT id FROM queued_banners WHERE user_id = ?1 ORDER BY id DESC LIMIT ?2)",
    userId,
    BANNERS_KEPT
  )
}

// Banners saved while the person had nothing open. They are handed over once.
export function takeQueuedBanners(userId: string): RealtimeEvent[] {
  return transaction(() => {
    const rows = all<{ event: string; created_at: number }>(
      "SELECT event, created_at FROM queued_banners WHERE user_id = ? ORDER BY id",
      userId
    )
    run("DELETE FROM queued_banners WHERE user_id = ?", userId)
    const now = Date.now()
    return rows.filter((row) => now - row.created_at < BANNER_KEEP_MS).map((row) => JSON.parse(row.event) as RealtimeEvent)
  })
}

// Drops banners nobody came back for. Runs from the maintenance pass.
export function pruneQueuedBanners(now: number): void {
  run("DELETE FROM queued_banners WHERE created_at <= ?", now - BANNER_KEEP_MS)
}

// Tells someone they missed a call, unless they muted the conversation or a block stands between them.
function missedCallBanner(call: Call, recipientId: string, fromId: string): void {
  if (memberMuted(call.conversationId, recipientId) !== false) return
  if (blockedEitherWay(recipientId, fromId)) return
  const from = personOf(fromId)
  if (!from) return
  const group = call.kind === "group"
  deliverBanner(recipientId, {
    type: "banner",
    kind: "missed-call",
    conversationId: call.conversationId,
    title: group ? groupTitle(call.conversationId, recipientId) : from.name,
    line: group ? `Missed group call from ${from.name}` : "Missed call",
    preview: null,
    href: `/messages/${call.conversationId}`,
    from,
  })
}

// ── One-to-one calls ────────────────────────────────────────────────────────────────────────────────────────────────

function closeDm(call: DmCall, outcome: CallOutcome, seconds: number): void {
  call.ringUntil = null
  endCall(call)
  writeRecord(call, outcome, seconds, 2, [call.caller.userId])
}

function answerDm(call: DmCall, device: Device): void {
  const now = Date.now()
  call.answeredAt = now
  call.callee = device
  call.ringUntil = null
  call.beats.set(call.caller.userId, now)
  call.beats.set(device.userId, now)
  relay(call.caller.userId, call.id, { kind: "accept" }, call.caller.deviceId)
  // Every other tab of the person called was ringing too. They stop, since this one answered.
  relay(device.userId, call.id, { kind: "claimed", device: device.deviceId })
}

// The person called turns the ring down. Every tab that rang stops, and the caller hears it was declined.
function declineDm(call: DmCall): void {
  closeDm(call, "declined", 0)
  relay(call.caller.userId, call.id, { kind: "decline" }, call.caller.deviceId)
  relay(call.calleeId, call.id, { kind: "end", reason: "declined", seconds: 0 })
}

// The caller gives up before an answer. Every tab that rang stops, and it is a missed call for the other person.
function cancelDm(call: DmCall, banner: boolean): void {
  closeDm(call, "missed", 0)
  relay(call.calleeId, call.id, { kind: "end", reason: "missed", seconds: 0 })
  if (banner) missedCallBanner(call, call.calleeId, call.caller.userId)
}

// Nobody answered: the caller hears so, and the ring stops everywhere.
function unansweredDm(call: DmCall, banner: boolean): void {
  closeDm(call, "missed", 0)
  relay(call.caller.userId, call.id, { kind: "end", reason: "missed", seconds: 0 }, call.caller.deviceId)
  relay(call.calleeId, call.id, { kind: "end", reason: "missed", seconds: 0 })
  if (banner) missedCallBanner(call, call.calleeId, call.caller.userId)
}

// An answered call ends at `at`. It counts only the time it was connected. One that never connected failed.
function hangUpDm(call: DmCall, byUserId: string, at: number, byReason?: CallEndReason, otherReason?: CallEndReason): void {
  const connectedAt = call.connectedAt
  const seconds = connectedAt !== null ? Math.max(0, Math.round((at - connectedAt) / 1000)) : 0
  const outcome: CallOutcome = connectedAt !== null ? "ended" : "failed"
  closeDm(call, outcome, seconds)
  const byCaller = byUserId === call.caller.userId
  const mine = byCaller ? call.caller : call.callee
  const other = byCaller ? call.callee : call.caller
  if (other) relay(other.userId, call.id, { kind: "end", reason: otherReason ?? outcome, seconds }, other.deviceId)
  if (mine) relay(mine.userId, call.id, { kind: "end", reason: byReason ?? outcome, seconds }, mine.deviceId)
}

// The ring ran out. A one-to-one ring ends as missed, and a group ring stops.
function ringTimedOut(call: Call): void {
  if (call.kind === "dm") {
    call.ringUntil = null
    if (call.answeredAt === null) unansweredDm(call, true)
    return
  }
  ringWindowClosed(call)
}

// Rings the other person in a one-to-one chat. Pressing call while they are already calling you answers them.
// Someone with nothing open cannot ring: the caller hears so at once and they get a missed call.
export function startDmCall(conversationId: string, caller: Device, callee: EventPerson, from: EventPerson, video: boolean): StartResult {
  return operate<StartResult>(true, () => {
    for (const call of listCalls()) {
      if (
        call.kind === "dm" &&
        call.conversationId === conversationId &&
        call.answeredAt === null &&
        call.calleeId === caller.userId &&
        call.caller.userId === callee.id
      ) {
        answerDm(call, caller)
        return { ok: true, mode: "answered", callId: call.id, iceServers: iceServersFor(caller.userId), bootId: BOOT_ID, peer: callee }
      }
    }
    const mine = busyState(caller.userId)
    if (mine === "talking") return { ok: false, error: "You're already on a call." }
    if (mine === "ringing") return { ok: false, error: "Answer or decline the incoming call first." }
    if (busyState(callee.id) !== null) return { ok: false, error: `${callee.name} is on another call.` }

    const now = Date.now()
    const call: DmCall = {
      kind: "dm",
      id: randomUUID(),
      conversationId,
      video,
      caller,
      calleeId: callee.id,
      callee: null,
      startedAt: now,
      answeredAt: null,
      connectedAt: null,
      ringUntil: null,
      beats: new Map(),
    }
    if (listenerCount(callee.id) === 0) {
      writeRecord(call, "missed", 0, 2, [caller.userId])
      missedCallBanner(call, callee.id, caller.userId)
      return { ok: false, unavailable: true, error: `${callee.name} isn't available right now.` }
    }
    call.ringUntil = now + CALL_RING_MS
    createCall(call)
    relay(callee.id, call.id, { kind: "ring", call: "dm", conversationId, from, title: null, iceServers: iceServersFor(callee.id), video })
    return { ok: true, mode: "ringing", callId: call.id, iceServers: iceServersFor(caller.userId), bootId: BOOT_ID }
  })
}

function lostAt(action: Extract<CallAction, { kind: "end" }>, now: number): number {
  return now - Math.min(Math.max(action.lostMs ?? 0, 0), MAX_LOST_MS)
}

function dmSignal(call: DmCall, from: Device, action: CallAction): SignalResult {
  const isCaller = from.userId === call.caller.userId
  const isCallee = from.userId === call.calleeId
  if (!isCaller && !isCallee) return { ok: false, error: GONE }
  const answered = call.answeredAt !== null
  // The caller speaks only from the tab that placed the call, and the person called, once answered, only from the tab
  // that answered. Before that, any of their tabs can answer or decline.
  if (isCaller && from.deviceId !== call.caller.deviceId) return { ok: false, error: GONE }
  if (isCallee && answered && call.callee?.deviceId !== from.deviceId) {
    return action.kind === "accept" ? { ok: false, error: "You answered on another device." } : { ok: false, error: GONE }
  }

  switch (action.kind) {
    case "accept":
      if (!isCallee) return { ok: false, error: GONE }
      if (answered) return OK
      if (blockedEitherWay(call.caller.userId, call.calleeId)) {
        unansweredDm(call, false)
        return { ok: false, error: GONE }
      }
      answerDm(call, from)
      return OK
    case "decline":
      if (!isCallee || answered) return { ok: false, error: GONE }
      declineDm(call)
      return OK
    case "end":
      if (!answered) {
        // Cancelling your own ring is a missed call for the other person. Ending one you are being rung by declines it.
        if (isCaller) cancelDm(call, true)
        else declineDm(call)
        return OK
      }
      {
        const now = Date.now()
        const at = lostAt(action, now)
        hangUpDm(call, from.userId, at, undefined, at < now ? "dropped" : undefined)
      }
      return OK
    case "connected":
      if (!answered) return { ok: false, error: GONE }
      call.connectedAt ??= Date.now()
      return OK
    // Either side can offer or answer once the call is answered: the first offer comes from the caller, and a camera
    // started mid-call is a new offer from whichever side turned it on.
    case "offer": {
      if (!answered || !call.callee) return { ok: false, error: GONE }
      const to = isCaller ? call.callee : call.caller
      relay(to.userId, call.id, { kind: "offer", sdp: action.sdp, restart: action.restart, from: { userId: from.userId, deviceId: from.deviceId }, person: null }, to.deviceId)
      return OK
    }
    case "answer": {
      if (!answered || !call.callee) return { ok: false, error: GONE }
      const to = isCaller ? call.callee : call.caller
      relay(to.userId, call.id, { kind: "answer", sdp: action.sdp, from: { userId: from.userId, deviceId: from.deviceId } }, to.deviceId)
      return OK
    }
    case "ice": {
      if (!answered || !call.callee) return { ok: false, error: GONE }
      const to = isCaller ? call.callee : call.caller
      relay(to.userId, call.id, { kind: "ice", candidate: action.candidate, from: { userId: from.userId, deviceId: from.deviceId } }, to.deviceId)
      return OK
    }
  }
}

// ── Group calls ─────────────────────────────────────────────────────────────────────────────────────────────────────

function membersOf(call: GroupCall): GroupMember[] {
  return [...call.participants.values()]
    .sort((a, b) => a.seq - b.seq)
    .map((p) => ({ userId: p.userId, deviceId: p.deviceId, seq: p.seq, person: p.person }))
}

function groupState(call: GroupCall, live: boolean, viewerId: string, quiet: boolean): CallSignal {
  return {
    kind: "group",
    conversationId: call.conversationId,
    title: groupTitle(call.conversationId, viewerId),
    live,
    members: live ? membersOf(call) : [],
    quiet,
  }
}

// Every accepted member hears who is in the call, so their page can offer to join it.
function broadcastGroup(call: GroupCall, live: boolean): void {
  for (const member of acceptedMembers(call.conversationId)) {
    relay(member.user_id, call.id, groupState(call, live, member.user_id, member.muted === 1))
  }
}

function settleTogether(call: GroupCall, at: number): void {
  const together = call.connectedAt !== null && call.participants.size >= 2
  if (together && call.togetherSince === null) call.togetherSince = at
  if (!together && call.togetherSince !== null) {
    call.togetherMs += Math.max(0, at - call.togetherSince)
    call.togetherSince = null
  }
}

function liveGroupIn(conversationId: string): GroupCall | null {
  for (const call of listCalls()) {
    if (call.kind === "group" && call.conversationId === conversationId) return call
  }
  return null
}

function joinedResult(call: GroupCall, me: Participant): JoinResult {
  return {
    ok: true,
    callId: call.id,
    conversationId: call.conversationId,
    iceServers: iceServersFor(me.userId),
    bootId: BOOT_ID,
    seq: me.seq,
    members: membersOf(call).filter((member) => member.userId !== me.userId),
    title: groupTitle(call.conversationId, me.userId),
  }
}

// The last person left: the call writes its one record. It counts everyone who joined, and the time two or more
// people were connected. If nobody joined, it is a missed group call for everyone it rang.
function finishGroup(call: GroupCall, at: number): void {
  call.ringUntil = null
  endCall(call)
  settleTogether(call, at)
  const people = call.joined.size
  const outcome: CallOutcome = people < 2 ? "missed" : call.connectedAt !== null ? "ended" : "failed"
  writeRecord(call, outcome, outcome === "ended" ? call.togetherMs / 1000 : 0, people, [call.starterId, ...call.joined])
  for (const userId of call.ringing) relay(userId, call.id, { kind: "end", reason: "missed", seconds: 0 })
  call.ringing.clear()
  if (outcome === "missed") {
    for (const userId of call.rung) missedCallBanner(call, userId, call.starterId)
  }
  broadcastGroup(call, false)
}

// Someone leaves. Their tab hears why when it did not choose to go. Being rung for it stops too.
function leaveGroup(call: GroupCall, userId: string, reason: CallEndReason | null, at = Date.now()): void {
  const participant = call.participants.get(userId)
  if (participant) {
    call.participants.delete(userId)
    if (reason) relay(userId, call.id, { kind: "end", reason, seconds: 0 }, participant.deviceId)
    settleTogether(call, at)
  }
  if (call.ringing.delete(userId)) relay(userId, call.id, { kind: "end", reason: "missed", seconds: 0 })
  if (call.participants.size === 0) finishGroup(call, at)
  else broadcastGroup(call, true)
}

// The rings stop. A call nobody joined ends, and whoever started it hears that no one joined.
function ringWindowClosed(call: GroupCall): void {
  call.ringUntil = null
  for (const userId of call.ringing) relay(userId, call.id, { kind: "end", reason: "missed", seconds: 0 })
  call.ringing.clear()
  if (call.joined.size >= 2) {
    broadcastGroup(call, true)
    return
  }
  for (const participant of call.participants.values()) {
    relay(participant.userId, call.id, { kind: "end", reason: "nobody", seconds: 0 }, participant.deviceId)
  }
  call.participants.clear()
  finishGroup(call, Date.now())
}

// Starts a call in a group, or joins the one already going there. It rings the members who are free, reachable, have
// not muted the group, and have no block with anyone in the call.
export function startGroupCall(conversationId: string, device: Device, person: EventPerson): JoinResult {
  return operate<JoinResult>(true, () => {
    const live = liveGroupIn(conversationId)
    if (live) return joinGroupCall(live.id, device, person)
    const busy = busyState(device.userId)
    if (busy === "talking") return { ok: false, error: "You're already on a call." }
    if (busy === "ringing") return { ok: false, error: "Answer or decline the incoming call first." }

    const others = acceptedMembers(conversationId).filter(
      (member) =>
        member.user_id !== device.userId &&
        busyState(member.user_id) === null &&
        listenerCount(member.user_id) > 0 &&
        !blockedEitherWay(member.user_id, device.userId)
    )
    const now = Date.now()
    const me: Participant = { ...device, seq: 1, person, beat: now }
    const call: GroupCall = {
      kind: "group",
      id: randomUUID(),
      conversationId,
      starterId: device.userId,
      startedAt: now,
      ringUntil: now + CALL_RING_MS,
      seq: 1,
      participants: new Map([[device.userId, me]]),
      joined: new Set([device.userId]),
      rung: new Set(),
      ringing: new Set(),
      connectedAt: null,
      togetherSince: null,
      togetherMs: 0,
    }
    if (others.length === 0) {
      writeRecord(call, "missed", 0, 1, [device.userId])
      return { ok: false, error: "No one in this group is available right now." }
    }
    createCall(call)
    for (const member of others) {
      if (member.muted === 1) continue
      call.ringing.add(member.user_id)
      call.rung.add(member.user_id)
      relay(member.user_id, call.id, {
        kind: "ring",
        call: "group",
        conversationId,
        from: person,
        title: groupTitle(conversationId, member.user_id),
        iceServers: iceServersFor(member.user_id),
      })
    }
    broadcastGroup(call, true)
    return joinedResult(call, me)
  })
}

// Joins a group call, from its ring or from a Join banner. Joining from a second tab moves you there, and the first
// tab hears why it stopped.
export function joinGroupCall(callId: string, device: Device, person: EventPerson): JoinResult {
  return operate<JoinResult>(true, () => {
    const call = getCall(callId)
    if (!call || call.kind !== "group") return { ok: false, error: GONE }
    const current = call.participants.get(device.userId)
    if (current && current.deviceId === device.deviceId) return joinedResult(call, current)
    if (current) {
      call.participants.delete(device.userId)
      relay(device.userId, call.id, { kind: "end", reason: "moved", seconds: 0 }, current.deviceId)
    } else {
      const busy = busyState(device.userId, call.id)
      if (busy === "talking") return { ok: false, error: "You're already on a call." }
      if (busy === "ringing") return { ok: false, error: "Answer or decline the incoming call first." }
      if (call.participants.size >= GROUP_CALL_MAX) return { ok: false, error: `This call is full. Calls can have up to ${GROUP_CALL_MAX} people.` }
      if (blockedWithAnyone(call, device.userId)) return { ok: false, error: "You can't join this call." }
    }
    const now = Date.now()
    call.seq += 1
    const me: Participant = { ...device, seq: call.seq, person, beat: now }
    call.participants.set(device.userId, me)
    call.joined.add(device.userId)
    if (call.ringing.delete(device.userId)) relay(device.userId, call.id, { kind: "claimed", device: device.deviceId })
    settleTogether(call, now)
    broadcastGroup(call, true)
    return joinedResult(call, me)
  })
}

function groupSignal(call: GroupCall, from: Device, action: CallAction): SignalResult {
  const me = call.participants.get(from.userId)
  const inCall = me !== undefined && me.deviceId === from.deviceId
  switch (action.kind) {
    case "accept":
      return { ok: false, error: GONE }
    case "decline":
      // Turning a group ring down stops it on every tab. The call goes on, and it can still be joined.
      if (call.ringing.delete(from.userId)) relay(from.userId, call.id, { kind: "end", reason: "declined", seconds: 0 })
      return OK
    case "end":
      if (inCall) leaveGroup(call, from.userId, null, lostAt(action, Date.now()))
      return OK
    case "connected":
      if (!inCall) return { ok: false, error: GONE }
      if (call.connectedAt === null) {
        call.connectedAt = Date.now()
        settleTogether(call, call.connectedAt)
      }
      return OK
    case "offer":
    case "answer":
    case "ice": {
      if (!inCall) return { ok: false, error: GONE }
      const to = action.to ? call.participants.get(action.to.userId) : undefined
      if (!to || !action.to || to.deviceId !== action.to.deviceId) return { ok: false, error: "They left the call." }
      const ref = { userId: from.userId, deviceId: from.deviceId }
      const signal: CallSignal =
        action.kind === "offer"
          ? { kind: "offer", sdp: action.sdp, restart: action.restart, from: ref, person: me.person }
          : action.kind === "answer"
            ? { kind: "answer", sdp: action.sdp, from: ref }
            : { kind: "ice", candidate: action.candidate, from: ref }
      relay(to.userId, call.id, signal, to.deviceId)
      return OK
    }
  }
}

// ── Both kinds ──────────────────────────────────────────────────────────────────────────────────────────────────────

// One step of a call from a tab, already checked for shape by the server action.
export function signalCall(callId: string, from: Device, action: CallAction): SignalResult {
  return operate<SignalResult>(true, () => {
    const call = getCall(callId)
    if (!call) return { ok: false, error: GONE }
    return call.kind === "dm" ? dmSignal(call, from, action) : groupSignal(call, from, action)
  })
}

// A tab in a call checks in. False tells it the call is over.
export function heartbeat(callId: string, device: Device): boolean {
  return operate<boolean>(true, () => {
    const call = getCall(callId)
    if (!call) return false
    const now = Date.now()
    if (call.kind === "dm") {
      const own = device.userId === call.caller.userId ? call.caller : call.callee
      if (!own || own.userId !== device.userId || own.deviceId !== device.deviceId) return false
      call.beats.set(device.userId, now)
      return true
    }
    const participant = call.participants.get(device.userId)
    if (!participant || participant.deviceId !== device.deviceId) return false
    participant.beat = now
    return true
  })
}

// A tab closing mid-call. It ends a call it placed or answered, and leaves a group call. A tab that was only ringing
// leaves the person's other tabs ringing.
export function endFromClosingTab(callId: string, device: Device): void {
  operate(true, () => {
    const call = getCall(callId)
    if (!call) return
    if (call.kind === "dm") {
      const own = device.userId === call.caller.userId ? call.caller : call.callee
      if (!own || own.userId !== device.userId || own.deviceId !== device.deviceId) return
      dmSignal(call, device, { kind: "end" })
      return
    }
    const participant = call.participants.get(device.userId)
    if (participant && participant.deviceId === device.deviceId) leaveGroup(call, device.userId, null)
  })
}

// Runs every second on the process that holds the maintenance lease. An unanswered ring ends at its deadline. An answered
// call whose tabs stopped checking in ends where it was last heard from.
export function expireStaleCalls(now: number): void {
  if (!anyCalls()) return
  operate(true, () => {
    for (const call of listCalls()) {
      if (!alive(call)) continue
      if (call.kind === "dm") {
        if (call.answeredAt === null) {
          if (call.ringUntil !== null && now >= call.ringUntil) ringTimedOut(call)
          continue
        }
        for (const [userId, beat] of call.beats) {
          if (now - beat > CALL_STALE_MS) {
            hangUpDm(call, userId, beat, "dropped", "dropped")
            break
          }
        }
        continue
      }
      if (call.ringUntil !== null && now >= call.ringUntil) ringTimedOut(call)
      for (const participant of [...call.participants.values()]) {
        if (!alive(call)) break
        if (now - participant.beat > CALL_STALE_MS) leaveGroup(call, participant.userId, "dropped", participant.beat)
      }
    }
  })
}

function departDm(call: DmCall, userId: string, reason: HangUpReason | "left" | "removed", session: string | null): void {
  const isCaller = call.caller.userId === userId
  if (!isCaller && call.calleeId !== userId) return
  if (reason === "blocked" && !blockedEitherWay(call.caller.userId, call.calleeId)) return
  const own = isCaller ? call.caller : call.callee
  // A sign-out on one browser ends only the call running there. A ring keeps going on the person's other devices.
  if (session !== null && own?.session !== session) return
  const note: CallEndReason | undefined = reason === "blocked" ? undefined : reason
  if (call.answeredAt === null) {
    if (isCaller) {
      cancelDm(call, reason === "signed-out" || reason === "left")
      if (note) relay(userId, call.id, { kind: "end", reason: note, seconds: 0 }, call.caller.deviceId)
    } else {
      unansweredDm(call, false)
    }
    return
  }
  hangUpDm(call, userId, Date.now(), note)
}

function blocks(blockerId: string, blockedId: string): boolean {
  return get("SELECT 1 AS found FROM blocks WHERE blocker_id = ? AND blocked_id = ?", blockerId, blockedId) !== undefined
}

// A block between two people in one group call: whoever was blocked goes, so the person who blocked keeps their call.
// A ring for a call with someone across the block stops.
function settleBlocks(call: GroupCall, userId: string): void {
  if (call.ringing.has(userId) && blockedWithAnyone(call, userId)) leaveGroup(call, userId, null)
  if (!alive(call) || !call.participants.has(userId)) return
  for (const other of [...call.ringing]) {
    if (blockedEitherWay(userId, other)) leaveGroup(call, other, null)
  }
  for (const other of [...call.participants.keys()]) {
    if (other === userId || !alive(call) || !call.participants.has(userId)) continue
    if (blocks(other, userId)) leaveGroup(call, userId, "blocked")
    else if (blocks(userId, other)) leaveGroup(call, other, "blocked")
  }
}

function departGroup(call: GroupCall, userId: string, reason: HangUpReason | "left" | "removed", session: string | null): void {
  if (reason === "blocked") {
    settleBlocks(call, userId)
    return
  }
  const participant = call.participants.get(userId)
  if (!participant && !call.ringing.has(userId)) return
  if (session !== null && participant?.session !== session) return
  leaveGroup(call, userId, reason)
}

// Ends a person's part in live calls and writes the right records: a ring that stops is missed, an answered call
// that never connected failed, and a connected call ended with the time it was connected.
//
// signed-out, deactivated and deleted end every call the person is in or being rung for. With `session` (the hash
// of the sign-in being ended, from currentSessionHash()), signed-out ends only the call running in that browser.
// blocked is called after the block is saved, with either person's id (or both). A one-to-one call between the pair
// ends. In a group call the person who was blocked leaves and the person who blocked stays, and a ring for a call
// with someone across the block stops.
export function hangUpFor(userId: string, reason: HangUpReason, session: string | null = null): void {
  if (!anyCalls()) return
  operate(true, () => {
    for (const call of listCalls()) {
      if (!alive(call)) continue
      if (call.kind === "dm") departDm(call, userId, reason, session)
      else departGroup(call, userId, reason, session)
    }
  })
}

// A person leaves a conversation, declines its request, or (with "removed") is removed from a group by the person who
// made it. Their call in it ends, or, in a group, they leave the call and it drops out of their view. Their tab says
// which of the two happened.
export function leaveConversationCalls(userId: string, conversationId: string, how: "left" | "removed" = "left"): void {
  if (!anyCalls()) return
  operate(true, () => {
    for (const call of listCalls()) {
      if (call.conversationId !== conversationId || !alive(call)) continue
      if (call.kind === "dm") {
        departDm(call, userId, how, null)
        continue
      }
      departGroup(call, userId, how, null)
      relay(userId, call.id, { kind: "group", conversationId, title: "", live: false, members: [], quiet: true })
    }
  })
}

// What a newly opened event stream needs at once: the group calls going on in the person's groups, and rings still
// waiting for them, so a tab opened mid-ring can answer.
export function openingEvents(userId: string): RealtimeEvent[] {
  if (!anyCalls()) return []
  return operate(false, () => {
    const events: RealtimeEvent[] = []
    for (const call of listCalls()) {
      if (call.kind === "dm") {
        if (call.calleeId !== userId || call.answeredAt !== null) continue
        const from = personOf(call.caller.userId)
        if (!from) continue
        events.push({
          type: "call",
          callId: call.id,
          signal: { kind: "ring", call: "dm", conversationId: call.conversationId, from, title: null, iceServers: iceServersFor(userId), video: call.video },
        })
        continue
      }
      const muted = memberMuted(call.conversationId, userId)
      if (muted === null) continue
      events.push({ type: "call", callId: call.id, signal: groupState(call, true, userId, muted) })
      if (!call.ringing.has(userId)) continue
      const from = personOf(call.starterId) ?? [...call.participants.values()][0]?.person ?? null
      if (!from) continue
      events.push({
        type: "call",
        callId: call.id,
        signal: {
          kind: "ring",
          call: "group",
          conversationId: call.conversationId,
          from,
          title: groupTitle(call.conversationId, userId),
          iceServers: iceServersFor(userId),
        },
      })
    }
    return events
  })
}
