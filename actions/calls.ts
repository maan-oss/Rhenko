"use server"

import { currentSessionHash, getAgreedViewer } from "@/lib/auth"
import { all, get } from "@/lib/db"
import type { CallAction, CallPeerRef, IceCandidateJson } from "@/lib/bus"
import {
  callInfo,
  heartbeat,
  joinGroupCall as joinGroup,
  personOf,
  serverBootId,
  signalCall,
  startDmCall,
  startGroupCall as startGroup,
  type Device,
  type JoinResult,
  type SignalResult,
  type StartResult,
} from "@/lib/call-state"
import { blockedEitherWay } from "@/lib/notify"
import { pushCallRing } from "@/lib/push"
import { consume, waitLabel } from "@/lib/rate-limit"
import { CALL_CANDIDATE_MAX, CALL_SDP_MAX } from "@/lib/rules"

// The server side of calls. Each action checks who is asking and what they may touch, then hands the step to the
// live call state in lib/call-state.ts. Every tab sends its own device id, so a call talks to the one tab in it.

export type StartedCall = StartResult
export type JoinedCall = JoinResult
export type CallResult = SignalResult
export type BeatResult = { ok: boolean; bootId: string }

const ID = /^[A-Za-z0-9-]{8,64}$/
const GONE = "That call has ended."
// Starting calls is limited, so nobody can ring someone over and over.
const START_LIMIT = 12
const START_WINDOW_MS = 60_000

function asId(value: unknown): string | null {
  return typeof value === "string" && ID.test(value) ? value : null
}

async function startLimited(userId: string): Promise<string | null> {
  const limit = await consume(`call:start:${userId}`, START_LIMIT, START_WINDOW_MS)
  return limit.ok ? null : `You're starting calls too quickly. Try again in ${waitLabel(limit.retryAfterSeconds)}.`
}

async function memberStatus(conversationId: string, userId: string): Promise<"accepted" | "requested" | null> {
  return (
    (await get<{ status: "accepted" | "requested" }>(
      "SELECT status FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
      conversationId,
      userId
    ))?.status ?? null
  )
}

function peerRef(value: unknown): CallPeerRef | null {
  if (!value || typeof value !== "object") return null
  const { userId, deviceId } = value as Record<string, unknown>
  const user = asId(userId)
  const device = asId(deviceId)
  return user && device ? { userId: user, deviceId: device } : null
}

function candidateOf(value: unknown): IceCandidateJson | null {
  if (!value || typeof value !== "object") return null
  const { candidate, sdpMid, sdpMLineIndex } = value as Record<string, unknown>
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > CALL_CANDIDATE_MAX) return null
  return {
    candidate,
    sdpMid: typeof sdpMid === "string" && sdpMid.length <= 64 ? sdpMid : null,
    sdpMLineIndex: typeof sdpMLineIndex === "number" && Number.isInteger(sdpMLineIndex) && sdpMLineIndex >= 0 && sdpMLineIndex < 64 ? sdpMLineIndex : null,
  }
}

// A call step from the browser, rebuilt field by field so nothing unexpected passes through.
function actionOf(value: unknown): CallAction | null {
  if (!value || typeof value !== "object") return null
  const action = value as Record<string, unknown>
  switch (action.kind) {
    case "accept":
    case "decline":
    case "connected":
      return { kind: action.kind }
    case "end": {
      const lost = action.lostMs
      return { kind: "end", lostMs: typeof lost === "number" && Number.isFinite(lost) && lost > 0 ? Math.min(lost, 60_000) : 0 }
    }
    case "offer":
    case "answer": {
      if (typeof action.sdp !== "string" || action.sdp.length === 0 || action.sdp.length > CALL_SDP_MAX) return null
      const to = action.to == null ? null : peerRef(action.to)
      if (action.to != null && !to) return null
      return action.kind === "offer"
        ? { kind: "offer", to, sdp: action.sdp, restart: action.restart === true, screen: action.screen === true }
        : { kind: "answer", to, sdp: action.sdp }
    }
    case "ice": {
      const candidate = candidateOf(action.candidate)
      const to = action.to == null ? null : peerRef(action.to)
      if (!candidate || (action.to != null && !to)) return null
      return { kind: "ice", to, candidate }
    }
  }
  return null
}

// Rings the other person in a one-to-one chat. Both must have accepted the conversation and neither can be on a call.
export async function startCall(conversationId: string, deviceId: string, video = false): Promise<StartedCall> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const device = asId(deviceId)
  if (!id || !device) return { ok: false, error: "That conversation doesn't exist." }
  const conversation = await get<{ kind: "dm" | "group" }>("SELECT kind FROM conversations WHERE id = ?", id)
  const members = await all<{ user_id: string; status: string }>("SELECT user_id, status FROM conversation_members WHERE conversation_id = ?", id)
  const mine = members.find((member) => member.user_id === viewer.id)
  if (!conversation || !mine) return { ok: false, error: "That conversation doesn't exist." }
  const others = members.filter((member) => member.user_id !== viewer.id)
  if (conversation.kind !== "dm" || others.length !== 1) return { ok: false, error: "Use the group call button to call a group." }
  if (mine.status !== "accepted") return { ok: false, error: "Accept this conversation first." }
  const other = others[0]
  if (other.status !== "accepted") return { ok: false, error: "You can call once they accept your message." }
  if (await blockedEitherWay(viewer.id, other.user_id)) return { ok: false, error: "You can't call this account." }
  const callee = await personOf(other.user_id)
  if (!callee) return { ok: false, error: "This account isn't available." }
  const from = await personOf(viewer.id)
  if (!from) return { ok: false, error: "Sign in first." }
  const limited = await startLimited(viewer.id)
  if (limited) return { ok: false, error: limited }
  const caller: Device = { userId: viewer.id, deviceId: device, session: await currentSessionHash() }
  const started = await startDmCall(id, caller, callee, from, video === true)
  if (started.ok && started.mode === "ringing") {
    void pushCallRing(id, { id: viewer.id, name: from.name }, null, video === true, [other.user_id]).catch((error) =>
      console.error("[push] ring failed", error)
    )
  }
  return started
}

// Starts a voice call in a group, or joins the one already going there.
export async function startGroupCall(conversationId: string, deviceId: string): Promise<JoinedCall> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(conversationId)
  const device = asId(deviceId)
  if (!id || !device) return { ok: false, error: "That conversation doesn't exist." }
  const conversation = await get<{ kind: "dm" | "group" }>("SELECT kind FROM conversations WHERE id = ?", id)
  const status = await memberStatus(id, viewer.id)
  if (!conversation || !status) return { ok: false, error: "That conversation doesn't exist." }
  if (conversation.kind !== "group") return { ok: false, error: "Group calls start in group chats." }
  if (status !== "accepted") return { ok: false, error: "Accept this group first." }
  const person = await personOf(viewer.id)
  if (!person) return { ok: false, error: "Sign in first." }
  const limited = await startLimited(viewer.id)
  if (limited) return { ok: false, error: limited }
  return await startGroup(id, { userId: viewer.id, deviceId: device, session: await currentSessionHash() }, person)
}

// Joins a group call that is going on, from its ring or a Join banner. Only accepted members of the group can.
export async function joinGroupCall(callId: string, deviceId: string): Promise<JoinedCall> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(callId)
  const device = asId(deviceId)
  const info = id ? await callInfo(id) : null
  if (!id || !device || !info || info.kind !== "group") return { ok: false, error: GONE }
  const status = await memberStatus(info.conversationId, viewer.id)
  if (!status) return { ok: false, error: GONE }
  if (status !== "accepted") return { ok: false, error: "Accept this group first." }
  const person = await personOf(viewer.id)
  if (!person) return { ok: false, error: "Sign in first." }
  return await joinGroup(id, { userId: viewer.id, deviceId: device, session: await currentSessionHash() }, person)
}

// One step of a call from the browser: answering, declining or ending, saying the audio connected, or passing an
// offer, an answer or a network route to the other side.
export async function sendCallSignal(callId: string, deviceId: string, action: CallAction): Promise<CallResult> {
  const viewer = await getAgreedViewer()
  if (!viewer) return { ok: false, error: "Sign in first." }
  const id = asId(callId)
  const device = asId(deviceId)
  const step = actionOf(action)
  if (!id || !device || !step) return { ok: false, error: GONE }
  const session = step.kind === "accept" ? await currentSessionHash() : null
  return await signalCall(id, { userId: viewer.id, deviceId: device, session }, step)
}

// Sent every few seconds by a tab in a call. A false answer means the call is over. The boot id lets the tab tell
// when that is because the server restarted.
export async function callHeartbeat(callId: string, deviceId: string): Promise<BeatResult> {
  const bootId = serverBootId()
  const viewer = await getAgreedViewer()
  const id = asId(callId)
  const device = asId(deviceId)
  if (!viewer || !id || !device) return { ok: false, bootId }
  return { ok: await heartbeat(id, { userId: viewer.id, deviceId: device, session: null }), bootId }
}
