// The browser side of a voice call. Signals travel through server actions and come back over the realtime stream. The
// audio goes straight between the two browsers (WebRTC). One call at a time in each browser, held outside React so a
// call survives page changes.

import { sendCallSignal, startCall } from "@/actions/calls"
import type { CallSignal, EventPerson, IceCandidateJson, IceServerConfig } from "@/lib/bus"
import { formatDuration } from "@/lib/format"
import { startRingtone, stopRingtone } from "@/lib/ringtone"

export type CallStatus = "outgoing" | "incoming" | "connecting" | "active" | "reconnecting" | "ended"

export type CallState = {
  status: CallStatus | "idle"
  callId: string | null
  conversationId: string | null
  peer: EventPerson | null
  muted: boolean
  // When the audio connected. Null until then, so an unanswered call has no timer.
  connectedAt: number | null
  // How the last call ended, shown for a moment after it does.
  note: string | null
}

const IDLE: CallState = { status: "idle", callId: null, conversationId: null, peer: null, muted: false, connectedAt: null, note: null }
const NOTE_MS = 2600
const CONNECT_LIMIT_MS = 25_000
const MIC_DENIED = "Allow microphone access to make calls."
const INSECURE = "Calls need a secure connection (HTTPS)."

let state: CallState = IDLE
const listeners = new Set<() => void>()

function update(next: Partial<CallState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function getCallState(): CallState {
  return state
}

export function subscribeCall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

type Session = {
  role: "caller" | "callee"
  callId: string
  iceServers: IceServerConfig[]
  local: MediaStream | null
  pc: RTCPeerConnection | null
  pendingIce: RTCIceCandidateInit[]
  remoteSet: boolean
  connectTimer: ReturnType<typeof setTimeout> | null
}

let session: Session | null = null
let starting = false
let remoteAudio: HTMLAudioElement | null = null

// Asks for the microphone. Resolves to the stream, or to a sentence the person can act on.
async function microphone(): Promise<MediaStream | string> {
  if (!window.isSecureContext || !navigator.mediaDevices) return INSECURE
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch {
    return MIC_DENIED
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

function remoteElement(): HTMLAudioElement {
  if (!remoteAudio) {
    remoteAudio = new Audio()
    remoteAudio.autoplay = true
  }
  return remoteAudio
}

// Releases the microphone and the connection on this side. Nothing is sent to the other person here.
function teardown(): void {
  const current = session
  session = null
  stopRingtone()
  if (!current) return
  if (current.connectTimer !== null) clearTimeout(current.connectTimer)
  current.pc?.close()
  stopStream(current.local)
  if (remoteAudio) remoteAudio.srcObject = null
}

// Tears the call down here and shows how it ended for a moment. The note fades, unless another call has started.
function endLocally(note: string | null): void {
  teardown()
  if (!note) {
    update({ ...IDLE })
    return
  }
  update({ status: "ended", callId: null, muted: false, connectedAt: null, note })
  setTimeout(() => {
    if (state.status === "ended") update({ ...IDLE })
  }, NOTE_MS)
}

// Ends the call from this side and tells the other person. A connected call reads as its length, otherwise the fallback.
function endSession(fallbackNote: string | null): void {
  const current = session
  if (!current) return
  const connectedAt = state.connectedAt
  void sendCallSignal(current.callId, { kind: "end" })
  endLocally(connectedAt ? `Call ended · ${formatDuration((Date.now() - connectedAt) / 1000)}` : fallbackNote)
}

function armConnectTimer(current: Session): void {
  if (current.connectTimer !== null) clearTimeout(current.connectTimer)
  current.connectTimer = setTimeout(() => {
    if (session === current && state.status !== "active") endSession("Couldn't connect.")
  }, CONNECT_LIMIT_MS)
}

function connected(current: Session): void {
  if (current.connectTimer !== null) clearTimeout(current.connectTimer)
  current.connectTimer = null
  stopRingtone()
  update({ status: "active", connectedAt: state.connectedAt ?? Date.now() })
}

function createPeer(current: Session): RTCPeerConnection {
  const pc = new RTCPeerConnection({ iceServers: current.iceServers })
  current.pc = pc
  if (current.local) {
    for (const track of current.local.getTracks()) pc.addTrack(track, current.local)
  }
  pc.onicecandidate = (event) => {
    if (!event.candidate || session !== current) return
    const json = event.candidate.toJSON()
    void sendCallSignal(current.callId, {
      kind: "ice",
      candidate: { candidate: json.candidate ?? "", sdpMid: json.sdpMid ?? null, sdpMLineIndex: json.sdpMLineIndex ?? null },
    })
  }
  pc.ontrack = (event) => {
    if (session !== current) return
    const audio = remoteElement()
    audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
    void audio.play().catch(() => {})
  }
  pc.onconnectionstatechange = () => {
    if (session !== current) return
    if (pc.connectionState === "connected") connected(current)
    else if (pc.connectionState === "disconnected") update({ status: "reconnecting" })
    else if (pc.connectionState === "failed") endSession("Couldn't connect.")
  }
  return pc
}

async function flushIce(current: Session): Promise<void> {
  const pc = current.pc
  if (!pc) return
  for (const candidate of current.pendingIce.splice(0)) {
    await pc.addIceCandidate(candidate).catch(() => {})
  }
}

// The caller has been accepted: make the offer.
async function sendOffer(current: Session): Promise<void> {
  update({ status: "connecting" })
  armConnectTimer(current)
  const pc = createPeer(current)
  try {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    if (session !== current) return
    await sendCallSignal(current.callId, { kind: "offer", sdp: offer.sdp ?? "" })
  } catch {
    if (session === current) endSession("Couldn't connect.")
  }
}

// The callee has the offer: answer it.
async function sendAnswer(current: Session, sdp: string): Promise<void> {
  if (current.pc) return
  const pc = createPeer(current)
  try {
    await pc.setRemoteDescription({ type: "offer", sdp })
    current.remoteSet = true
    await flushIce(current)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    if (session !== current) return
    await sendCallSignal(current.callId, { kind: "answer", sdp: answer.sdp ?? "" })
  } catch {
    if (session === current) endSession("Couldn't connect.")
  }
}

// The caller has the answer: finish the handshake. A second answer, from another device, is ignored.
async function applyAnswer(current: Session, sdp: string): Promise<void> {
  const pc = current.pc
  if (!pc || pc.signalingState !== "have-local-offer") return
  try {
    await pc.setRemoteDescription({ type: "answer", sdp })
    current.remoteSet = true
    await flushIce(current)
  } catch {
    if (session === current) endSession("Couldn't connect.")
  }
}

// Candidates can arrive before the description they belong to, so they wait for it.
function addIce(current: Session, candidate: IceCandidateJson): void {
  const init: RTCIceCandidateInit = { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex }
  if (!current.pc || !current.remoteSet) {
    current.pendingIce.push(init)
    return
  }
  void current.pc.addIceCandidate(init).catch(() => {})
}

function ring(callId: string, signal: Extract<CallSignal, { kind: "ring" }>): void {
  // Already on a call: turn this one away, so the caller gets a decline instead of a ring that goes nowhere.
  if (session || (state.status !== "idle" && state.status !== "ended")) {
    void sendCallSignal(callId, { kind: "decline" })
    return
  }
  session = {
    role: "callee",
    callId,
    iceServers: signal.iceServers,
    local: null,
    pc: null,
    pendingIce: [],
    remoteSet: false,
    connectTimer: null,
  }
  update({ status: "incoming", callId, conversationId: signal.conversationId, peer: signal.from, muted: false, connectedAt: null, note: null })
  startRingtone("incoming")
}

// Gets the other person ringing in this conversation. Resolves to a message when it cannot start.
export async function placeCall(conversationId: string, peer: EventPerson): Promise<{ ok: true } | { ok: false; error: string }> {
  if (session || starting) return { ok: false, error: "You're already on a call." }
  starting = true
  try {
    const mic = await microphone()
    if (typeof mic === "string") return { ok: false, error: mic }
    const started = await startCall(conversationId)
    if (!started.ok) {
      stopStream(mic)
      return { ok: false, error: started.error }
    }
    session = {
      role: "caller",
      callId: started.callId,
      iceServers: started.iceServers,
      local: mic,
      pc: null,
      pendingIce: [],
      remoteSet: false,
      connectTimer: null,
    }
    update({ status: "outgoing", callId: started.callId, conversationId, peer, muted: false, connectedAt: null, note: null })
    startRingtone("outgoing")
    return { ok: true }
  } finally {
    starting = false
  }
}

// The person called answers. The microphone is asked for first, so the call never connects silent.
export async function acceptCall(): Promise<void> {
  const current = session
  if (!current || current.role !== "callee" || state.status !== "incoming") return
  const mic = await microphone()
  if (session !== current) {
    stopStream(typeof mic === "string" ? null : mic)
    return
  }
  if (typeof mic === "string") {
    void sendCallSignal(current.callId, { kind: "decline" })
    endLocally(mic)
    return
  }
  current.local = mic
  stopRingtone()
  update({ status: "connecting" })
  armConnectTimer(current)
  const result = await sendCallSignal(current.callId, { kind: "accept" })
  if (session !== current) return
  if (!result.ok) endLocally("That call has ended.")
}

// Turns the call down while it rings.
export function declineCall(): void {
  const current = session
  if (!current || current.role !== "callee" || state.status !== "incoming") return
  void sendCallSignal(current.callId, { kind: "decline" })
  endLocally(null)
}

// Leaves the call. Before it connects, that cancels it.
export function hangUp(): void {
  endSession(null)
}

export function toggleMute(): void {
  const next = !state.muted
  for (const track of session?.local?.getAudioTracks() ?? []) track.enabled = !next
  update({ muted: next })
}

// Realtime steps for the call in progress, or a new ring.
export function receiveCallSignal(callId: string, signal: CallSignal): void {
  if (signal.kind === "ring") {
    ring(callId, signal)
    return
  }
  const current = session
  if (!current || current.callId !== callId) return
  switch (signal.kind) {
    case "accept":
      if (current.role === "caller" && state.status === "outgoing") void sendOffer(current)
      return
    case "decline":
      endLocally("Declined")
      return
    case "end":
      if (signal.reason === "missed") {
        // A ring nobody answered: the caller sees it as no answer, the person called just stops ringing.
        endLocally(current.role === "caller" ? "No answer" : null)
        return
      }
      endLocally(`Call ended · ${formatDuration(signal.seconds)}`)
      return
    case "claimed":
      // Another of this person's devices answered. A device that is still ringing stops.
      if (current.role === "callee" && state.status === "incoming") endLocally(null)
      return
    case "offer":
      // Only the device that accepted answers. Other devices of the same person heard the offer too, and stay quiet.
      if (current.role === "callee" && current.local) void sendAnswer(current, signal.sdp)
      return
    case "answer":
      if (current.role === "caller") void applyAnswer(current, signal.sdp)
      return
    case "ice":
      addIce(current, signal.candidate)
      return
  }
}

// Whether this browser is already on a call, for the call button.
export function callBusy(): boolean {
  return session !== null || starting || (state.status !== "idle" && state.status !== "ended")
}
