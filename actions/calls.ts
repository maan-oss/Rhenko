"use server"

import { getViewer, newId } from "@/lib/auth"
import { all, get, run } from "@/lib/db"
import { publish, type CallSignal, type EventPerson, type IceCandidateJson, type IceServerConfig } from "@/lib/bus"
import type { CallOutcome } from "@/lib/format"
import { iceServers } from "@/lib/ice"
import { blockedEitherWay } from "@/lib/notify"
import { CALL_CANDIDATE_MAX, CALL_RING_MS, CALL_SDP_MAX } from "@/lib/rules"

// The steps the browser takes in a call. The ring, and how a call ended, come from the server.
export type CallAction =
  | { kind: "accept" }
  | { kind: "decline" }
  | { kind: "end" }
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: IceCandidateJson }

export type StartedCall = { ok: true; callId: string; iceServers: IceServerConfig[] } | { ok: false; error: string }
export type CallResult = { ok: true } | { ok: false; error: string }

// A call is live state: who is ringing or talking, and the timer that gives up on a ring nobody answers. It is kept in
// memory beside the event bus, so calls last as long as this server process does.
type Call = {
  id: string
  conversationId: string
  callerId: string
  calleeId: string
  answeredAt: number | null
  timer: ReturnType<typeof setTimeout> | null
}

type Globals = { __rhenkoCalls?: Map<string, Call> }
const globals = globalThis as unknown as Globals
const calls: Map<string, Call> = globals.__rhenkoCalls ?? new Map()
globals.__rhenkoCalls = calls

const GONE = "That call has ended."

function relay(userId: string, callId: string, signal: CallSignal): void {
  publish([userId], { type: "call", callId, signal })
}

function personOf(userId: string): EventPerson | null {
  const row = get<{ id: string; name: string; handle: string; avatar_file: string | null }>(
    "SELECT id, name, handle, avatar_file FROM users WHERE id = ? AND deactivated_at IS NULL",
    userId
  )
  return row ? { id: row.id, name: row.name, handle: row.handle, avatarFile: row.avatar_file } : null
}

function inCall(userId: string): boolean {
  for (const call of calls.values()) {
    if (call.callerId === userId || call.calleeId === userId) return true
  }
  return false
}

function memberIds(conversationId: string): string[] {
  return all<{ user_id: string }>("SELECT user_id FROM conversation_members WHERE conversation_id = ?", conversationId).map((r) => r.user_id)
}

function clearRing(call: Call): void {
  if (call.timer !== null) clearTimeout(call.timer)
  call.timer = null
}

// Ends a call for good. It leaves a record in the thread, and a missed call also tells the person who did not answer.
function finish(call: Call, outcome: CallOutcome, seconds: number): void {
  clearRing(call)
  calls.delete(call.id)
  const now = Date.now()
  run(
    "INSERT INTO chat_messages (id, conversation_id, sender_id, body, call_status, call_seconds, created_at) VALUES (?, ?, ?, '', ?, ?, ?)",
    newId(),
    call.conversationId,
    call.callerId,
    outcome,
    seconds,
    now
  )
  run("UPDATE conversations SET updated_at = ? WHERE id = ?", now, call.conversationId)
  publish(memberIds(call.conversationId), { type: "message", conversationId: call.conversationId })
  if (outcome !== "missed") return
  const caller = personOf(call.callerId)
  if (!caller) return
  publish([call.calleeId], {
    type: "banner",
    kind: "missed-call",
    conversationId: call.conversationId,
    title: caller.name,
    line: "Missed call",
    preview: null,
    href: `/messages/${call.conversationId}`,
    from: caller,
  })
}

// A ring that nobody answered in time.
function finishUnanswered(callId: string): void {
  const call = calls.get(callId)
  if (!call || call.answeredAt !== null) return
  finish(call, "missed", 0)
  relay(call.callerId, callId, { kind: "end", reason: "missed", seconds: 0 })
  relay(call.calleeId, callId, { kind: "end", reason: "missed", seconds: 0 })
}

// Rings the other person in a one-to-one chat. Both must have accepted the conversation, and neither can be on a call.
export async function startCall(conversationId: string): Promise<StartedCall> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const conversation = get<{ kind: "dm" | "group" }>("SELECT kind FROM conversations WHERE id = ?", conversationId)
  if (!conversation) return { ok: false, error: "That conversation doesn't exist." }
  const members = all<{ user_id: string; status: string }>("SELECT user_id, status FROM conversation_members WHERE conversation_id = ?", conversationId)
  const mine = members.find((m) => m.user_id === viewer.id)
  const others = members.filter((m) => m.user_id !== viewer.id)
  if (conversation.kind !== "dm" || members.length !== 2 || others.length !== 1) return { ok: false, error: "Calls work in one-to-one chats." }
  if (mine?.status !== "accepted") return { ok: false, error: "Accept this conversation first." }
  const callee = others[0]
  if (callee.status !== "accepted") return { ok: false, error: "You can call once they accept your message." }
  if (blockedEitherWay(viewer.id, callee.user_id)) return { ok: false, error: "You can't call this account." }
  if (inCall(viewer.id)) return { ok: false, error: "You're already on a call." }
  if (inCall(callee.user_id)) return { ok: false, error: "They're on another call." }
  const from = personOf(viewer.id)
  if (!from) return { ok: false, error: "Sign in first." }

  const id = newId()
  const call: Call = { id, conversationId, callerId: viewer.id, calleeId: callee.user_id, answeredAt: null, timer: null }
  call.timer = setTimeout(() => finishUnanswered(id), CALL_RING_MS)
  calls.set(id, call)
  const servers = iceServers()
  relay(callee.user_id, id, { kind: "ring", conversationId, from, iceServers: servers })
  return { ok: true, callId: id, iceServers: servers }
}

// One step of a call from the browser. The person called accepts or declines. The caller sends the offer, the callee the
// answer, and either side sends network candidates. Ending a call is allowed to either side.
export async function sendCallSignal(callId: string, action: CallAction): Promise<CallResult> {
  const viewer = await getViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const call = calls.get(callId)
  if (!call) return { ok: false, error: GONE }
  const isCaller = call.callerId === viewer.id
  if (!isCaller && call.calleeId !== viewer.id) return { ok: false, error: GONE }
  const peer = isCaller ? call.calleeId : call.callerId
  const answered = call.answeredAt !== null

  switch (action.kind) {
    case "accept": {
      if (isCaller || answered) return { ok: false, error: GONE }
      call.answeredAt = Date.now()
      clearRing(call)
      relay(peer, callId, { kind: "accept" })
      // The person's other devices were ringing too. They stop, since this one answered.
      relay(viewer.id, callId, { kind: "claimed" })
      return { ok: true }
    }
    case "decline": {
      if (isCaller || answered) return { ok: false, error: GONE }
      finish(call, "declined", 0)
      relay(peer, callId, { kind: "decline" })
      return { ok: true }
    }
    case "end": {
      if (!answered) {
        // Cancelling your own ring is a missed call for the other person. Turning one down is a decline.
        if (isCaller) {
          finish(call, "missed", 0)
          relay(peer, callId, { kind: "end", reason: "missed", seconds: 0 })
        } else {
          finish(call, "declined", 0)
          relay(peer, callId, { kind: "decline" })
        }
        return { ok: true }
      }
      const seconds = Math.round((Date.now() - (call.answeredAt ?? Date.now())) / 1000)
      finish(call, "ended", seconds)
      relay(peer, callId, { kind: "end", reason: "ended", seconds })
      return { ok: true }
    }
    case "offer": {
      if (!isCaller || !answered || typeof action.sdp !== "string" || action.sdp.length > CALL_SDP_MAX) return { ok: false, error: GONE }
      relay(peer, callId, { kind: "offer", sdp: action.sdp })
      return { ok: true }
    }
    case "answer": {
      if (isCaller || !answered || typeof action.sdp !== "string" || action.sdp.length > CALL_SDP_MAX) return { ok: false, error: GONE }
      relay(peer, callId, { kind: "answer", sdp: action.sdp })
      return { ok: true }
    }
    case "ice": {
      const candidate = action.candidate
      if (typeof candidate?.candidate !== "string" || candidate.candidate.length > CALL_CANDIDATE_MAX) return { ok: false, error: GONE }
      relay(peer, callId, {
        kind: "ice",
        candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null, sdpMLineIndex: candidate.sdpMLineIndex ?? null },
      })
      return { ok: true }
    }
  }
  return { ok: false, error: GONE }
}
