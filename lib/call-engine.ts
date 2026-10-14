// The browser side of voice calls, one to one and in groups. Signals travel through server actions and come back over
// the realtime stream. Audio goes straight between browsers (WebRTC), with one connection to each other person in the
// call. Each tab is its own device, and only one tab of a browser rings. The call is held outside React, so it
// survives page changes.

import { callHeartbeat, joinGroupCall as joinGroupAction, sendCallSignal, startCall, startGroupCall, type BeatResult, type JoinedCall } from "@/actions/calls"
import type { CallAction, CallEndReason, CallPeerRef, CallSignal, EventPerson, GroupMember, IceServerConfig, RealtimeEvent } from "@/lib/bus"
import { CALL_CONNECT_MS, CALL_HEARTBEAT_MS, CALL_RECONNECT_MS, CALL_RESTART_WAIT_MS, ICE_GATHER_MS } from "@/lib/call-rules"
import { formatDuration } from "@/lib/format"
import { startRingtone, stopRingtone } from "@/lib/ringtone"

export type CallStatus = "outgoing" | "incoming" | "connecting" | "active" | "reconnecting" | "ended"
export type TileStatus = "connecting" | "connected" | "reconnecting" | "failed"
export type CallTile = { key: string; person: EventPerson; status: TileStatus }

// A group call going on in one of your groups that this tab is not in.
export type LiveGroupCall = {
  callId: string
  conversationId: string
  title: string
  people: EventPerson[]
  // Muted groups get no Join banner. Mine means you are in it on another tab or device.
  quiet: boolean
  mine: boolean
  dismissed: boolean
}

export type CallState = {
  status: CallStatus | "idle"
  kind: "dm" | "group"
  callId: string | null
  conversationId: string | null
  // One to one: the other person. Group: who is calling, while it rings.
  peer: EventPerson | null
  // The group's name.
  title: string | null
  // Group: everyone else in the call, with how their connection is doing.
  tiles: CallTile[]
  muted: boolean
  // True while the microphone prompt and the answer run, so a second tap does nothing.
  accepting: boolean
  // When the audio first connected. Null until then, so an unanswered call has no timer.
  connectedAt: number | null
  // A video call: this person's picture and the other person's. Camera off keeps the call and sends no picture.
  video: boolean
  localVideo: MediaStream | null
  remoteVideo: MediaStream | null
  cameraOff: boolean
  // True while this person's camera is being started mid-call, so a second tap does nothing.
  cameraStarting: boolean
  // How the call ended, or why answering did not work, shown for a moment.
  note: string | null
  live: LiveGroupCall[]
}

export type Placed = { ok: true } | { ok: false; error: string }

type Peer = {
  key: string
  // The other tab. Null in a one-to-one call, where the server knows it.
  ref: CallPeerRef | null
  person: EventPerson
  offerer: boolean
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  status: TileStatus
  everConnected: boolean
  restarted: boolean
  lostAt: number | null
  remoteSet: boolean
  sdpSent: boolean
  pendingIce: RTCIceCandidateInit[]
  connectTimer: number | null
  graceTimer: number | null
  reconnectTimer: number | null
  // Offers and answers for one connection run one after another.
  chain: Promise<void>
  closed: boolean
}

type Session = {
  kind: "dm" | "group"
  role: "caller" | "callee" | "member"
  callId: string
  conversationId: string
  iceServers: IceServerConfig[]
  local: MediaStream | null
  peers: Map<string, Peer>
  // Group: when this tab joined. Whoever joined later sends the offer.
  seq: number
  hadPeers: boolean
  other: EventPerson | null
  answered: boolean
  connectedAt: number | null
  connectTimer: number | null
  beat: number | null
  boot: string | null
  reported: boolean
  video: boolean
}

type RingInfo = { kind: "dm" | "group"; conversationId: string; from: EventPerson; title: string | null; iceServers: IceServerConfig[]; video: boolean }
type Ring = { callId: string; info: RingInfo | null; claims: Map<string, number>; elsewhere: string | null; timer: number | null; at: number }
type GroupInfo = { callId: string; conversationId: string; title: string; members: GroupMember[]; quiet: boolean }

// Messages between tabs of one browser, so one tab rings.
type TabMessage =
  | { t: "claim"; callId: string; tab: string; rank: number }
  | { t: "ringing"; callId: string; tab: string }
  | { t: "take"; callId: string; tab: string }
  | { t: "yield"; callId: string; to: string }
  | { t: "release"; callId: string; tab: string }
  | { t: "dismiss"; callId: string }

type OfferSignal = Extract<CallSignal, { kind: "offer" }>
type AnswerSignal = Extract<CallSignal, { kind: "answer" }>
type IceSignal = Extract<CallSignal, { kind: "ice" }>
type GroupSignal = Extract<CallSignal, { kind: "group" }>

const NOTE_MS = 2600
const ELECTION_MS = 250
const EARLY_KEEP_MS = 30_000
const RING_KEEP_MS = 2 * 60 * 1000
const CHANNEL = "rhenko-calls"
const DM_PEER = "dm"
const INSECURE = "Calls need a secure connection (HTTPS)."
const RESTARTED = "The server restarted, so this call ended."
const OFFLINE = "Couldn't reach the server. Check your connection and try again."
const DROPPED = "The connection dropped, so the call ended."
const NO_CONNECT = "Couldn't connect."
const GONE = "That call has ended."
// The camera asked for on a video call: a sensible picture size, facing the person.
const CAMERA: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }

const IDLE: CallState = {
  status: "idle",
  kind: "dm",
  callId: null,
  conversationId: null,
  peer: null,
  title: null,
  tiles: [],
  muted: false,
  accepting: false,
  connectedAt: null,
  note: null,
  live: [],
  video: false,
  localVideo: null,
  remoteVideo: null,
  cameraOff: false,
  cameraStarting: false,
}

let state: CallState = IDLE
const listeners = new Set<() => void>()
let session: Session | null = null
let starting = false
let viewerId: string | null = null
let bootId: string | null = null
let tabId: string | null = null
let noteTimer: number | null = null
let channel: BroadcastChannel | null = null
let attached = false
const rings = new Map<string, Ring>()
const early = new Map<string, { signal: CallSignal; at: number }[]>()
const groups = new Map<string, GroupInfo>()
const dismissed = new Set<string>()

function update(next: Partial<CallState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

export function getCallState(): CallState {
  return state
}

// The state a server render (and the first hydration pass) shows: nothing is in a call until the browser has connected.
// Using the live state here would make the first client render differ from the server's HTML.
export function getServerCallState(): CallState {
  return IDLE
}

export function subscribeCall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// This tab's id in calls, made once per page load.
function device(): string {
  if (!tabId) {
    tabId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
  }
  return tabId
}

// Everything but the list of group calls going on, which outlives any one call.
function idle(): Partial<CallState> {
  return {
    status: "idle",
    kind: "dm",
    callId: null,
    conversationId: null,
    peer: null,
    title: null,
    tiles: [],
    muted: false,
    accepting: false,
    connectedAt: null,
    note: null,
    video: false,
    localVideo: null,
    remoteVideo: null,
    cameraOff: false,
    cameraStarting: false,
  }
}

function clearNote(): void {
  if (noteTimer !== null) window.clearTimeout(noteTimer)
  noteTimer = null
}

// Shows how a call ended for a moment, then clears. Without a note the call surface closes at once.
function settle(note: string | null, extra: Partial<CallState> = {}): void {
  clearNote()
  if (!note) {
    update(idle())
  } else {
    // The ended note keeps the kind of call, so its card still reads "Video call with" for as long as it is shown.
    update({ ...extra, status: "ended", callId: null, tiles: [], muted: false, accepting: false, connectedAt: null, note, localVideo: null, remoteVideo: null, cameraOff: false, cameraStarting: false })
    noteTimer = window.setTimeout(() => {
      noteTimer = null
      if (state.status === "ended") update(idle())
    }, NOTE_MS)
  }
  syncLive()
}

// Asks for the microphone. Resolves to the stream, or to a sentence the person can act on.
// Asks for the microphone, and for the camera on a video call. A camera that is missing or refused does not stop the
// call: it carries on with the microphone alone. Resolves to the stream, or to a sentence the person can act on.
async function microphone(purpose: "call" | "answer", video = false): Promise<MediaStream | string> {
  if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return INSECURE
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video: video ? CAMERA : false })
  } catch (error) {
    if (video) return microphone(purpose, false)
    const name = error instanceof DOMException ? error.name : ""
    if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Connect one and try again."
    if (name === "NotReadableError") return "Your microphone is busy in another app. Close it there and try again."
    return purpose === "answer" ? "Allow microphone access to answer." : "Allow microphone access to make calls."
  }
}

function hasVideo(stream: MediaStream | null): boolean {
  return (stream?.getVideoTracks().length ?? 0) > 0
}

// The picture of a stream, as a stream of its own, for the preview.
function videoOf(stream: MediaStream | null): MediaStream | null {
  const tracks = stream?.getVideoTracks() ?? []
  return tracks.length > 0 ? new MediaStream(tracks) : null
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

function send(current: Session, action: CallAction): Promise<{ ok: true } | { ok: false; error: string } | null> {
  return sendCallSignal(current.callId, device(), action).catch(() => null)
}

function clearTimer(timer: number | null): null {
  if (timer !== null) window.clearTimeout(timer)
  return null
}

// ── Tabs of one browser ─────────────────────────────────────────────────────────────────────────────────────────

function post(message: TabMessage): void {
  try {
    channel?.postMessage(message)
  } catch {
    // The channel closed with the page.
  }
}

// How well placed this tab is to ring: a focused tab first, then a visible one, then any.
function rank(): number {
  if (document.visibilityState !== "visible") return 2
  return document.hasFocus() ? 0 : 1
}

function ringEntry(callId: string): Ring {
  const now = Date.now()
  for (const [id, ring] of rings) {
    if (now - ring.at > RING_KEEP_MS && session?.callId !== id) forgetRing(id)
  }
  let ring = rings.get(callId)
  if (!ring) {
    ring = { callId, info: null, claims: new Map(), elsewhere: null, timer: null, at: now }
    rings.set(callId, ring)
  }
  return ring
}

function forgetRing(callId: string): void {
  const ring = rings.get(callId)
  if (!ring) return
  ring.timer = clearTimer(ring.timer)
  rings.delete(callId)
}

// Every idle tab that hears a ring claims it. After a short wait the best-placed claim rings; the rest stay quiet.
function elect(ring: Ring): void {
  if (!ring.info || ring.elsewhere || session || starting) return
  if (!channel) {
    ringHere(ring)
    return
  }
  const mine = rank()
  ring.claims.set(device(), mine)
  post({ t: "claim", callId: ring.callId, tab: device(), rank: mine })
  ring.timer = clearTimer(ring.timer)
  ring.timer = window.setTimeout(() => {
    ring.timer = null
    if (rings.get(ring.callId) !== ring || !ring.info || ring.elsewhere || session || starting) return
    const [winner] = [...ring.claims].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    if (winner?.[0] === device()) ringHere(ring)
  }, ELECTION_MS)
}

function ringHere(ring: Ring): void {
  const info = ring.info
  if (!info || session) return
  clearNote()
  session = {
    kind: info.kind,
    role: info.kind === "dm" ? "callee" : "member",
    callId: ring.callId,
    conversationId: info.conversationId,
    iceServers: info.iceServers,
    local: null,
    peers: new Map(),
    seq: 0,
    hadPeers: false,
    other: info.kind === "dm" ? info.from : null,
    video: info.kind === "dm" && info.video,
    answered: false,
    connectedAt: null,
    connectTimer: null,
    beat: null,
    boot: bootId,
    reported: false,
  }
  ring.elsewhere = null
  update({
    status: "incoming",
    kind: info.kind,
    video: info.kind === "dm" && info.video,
    localVideo: null,
    remoteVideo: null,
    cameraOff: false,
    cameraStarting: false,
    callId: ring.callId,
    conversationId: info.conversationId,
    peer: info.from,
    title: info.title,
    tiles: [],
    muted: false,
    accepting: false,
    connectedAt: null,
    note: null,
  })
  startRingtone("incoming")
  post({ t: "ringing", callId: ring.callId, tab: device() })
  syncLive()
}

// Stops ringing here and keeps the ring on file, for when another tab hands it back.
function quietHere(current: Session): void {
  teardown(current)
  settle(null)
}

function reconsiderRings(): void {
  for (const ring of rings.values()) {
    if (ring.info && !ring.elsewhere && ring.timer === null) elect(ring)
  }
}

function onTabMessage(message: TabMessage): void {
  const current = session
  const ringingHere = (callId: string) => current !== null && current.callId === callId && state.status === "incoming"
  switch (message.t) {
    case "claim": {
      ringEntry(message.callId).claims.set(message.tab, message.rank)
      // A tab that is ringing answers every claim, so a tab that heard the ring late stays quiet.
      if (ringingHere(message.callId)) post({ t: "ringing", callId: message.callId, tab: device() })
      return
    }
    case "ringing": {
      const ring = ringEntry(message.callId)
      ring.timer = clearTimer(ring.timer)
      if (current && ringingHere(message.callId)) {
        // Two tabs ringing after a race: the lower id keeps it, and the other goes quiet.
        if (state.accepting || message.tab > device()) return
        quietHere(current)
      }
      ring.elsewhere = message.tab
      return
    }
    case "take": {
      // A tab the person just looked at takes the ring from one in the background.
      if (!current || !ringingHere(message.callId) || state.accepting || document.visibilityState !== "hidden") return
      quietHere(current)
      ringEntry(message.callId).elsewhere = message.tab
      post({ t: "yield", callId: message.callId, to: message.tab })
      return
    }
    case "yield": {
      const ring = ringEntry(message.callId)
      if (message.to !== device()) {
        ring.elsewhere = message.to
        return
      }
      ring.elsewhere = null
      if (ring.info && !session && !starting) ringHere(ring)
      return
    }
    case "release": {
      // The ringing tab closed: the others choose again.
      const ring = rings.get(message.callId)
      if (!ring || ring.elsewhere !== message.tab) return
      ring.elsewhere = null
      ring.claims.clear()
      elect(ring)
      return
    }
    case "dismiss":
      dismissed.add(message.callId)
      syncLive()
      return
  }
}

function onVisible(): void {
  if (document.visibilityState !== "visible" || session || starting) return
  for (const ring of rings.values()) {
    if (ring.info && ring.elsewhere) post({ t: "take", callId: ring.callId, tab: device() })
  }
}

// A tab closing mid-call tells the server as it goes, so the call ends for the others at once. A tab that was only
// ringing hands the ring to another tab instead.
function onPageHide(): void {
  const current = session
  if (!current) return
  if (state.status === "incoming") {
    post({ t: "release", callId: current.callId, tab: device() })
    if (state.accepting && current.kind === "group") closingBeacon(current)
  } else {
    closingBeacon(current)
  }
  // A page restored from the back-forward cache starts with no call on screen.
  teardown(current)
  update(idle())
}

function closingBeacon(current: Session): void {
  const body = new URLSearchParams({ callId: current.callId, deviceId: device() })
  let sent = false
  try {
    sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/calls/leave", body)
  } catch {
    sent = false
  }
  if (!sent) void fetch("/api/calls/leave", { method: "POST", body, keepalive: true, credentials: "same-origin" }).catch(() => {})
}

// Called with the signed-in account when the realtime stream starts. Another account means the old one's call is over
// in this tab.
export function attachCalls(viewer: string): void {
  if (typeof window === "undefined") return
  if (viewerId !== null && viewerId !== viewer) switchedAccount()
  viewerId = viewer
  if (attached) return
  attached = true
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (event: MessageEvent<TabMessage>) => onTabMessage(event.data)
    } catch {
      channel = null
    }
  }
  window.addEventListener("pagehide", onPageHide)
  document.addEventListener("visibilitychange", onVisible)
}

function switchedAccount(): void {
  const current = session
  for (const ring of rings.values()) ring.timer = clearTimer(ring.timer)
  rings.clear()
  early.clear()
  groups.clear()
  dismissed.clear()
  if (!current) {
    syncLive()
    return
  }
  const ringing = state.status === "incoming"
  teardown(current)
  settle(ringing ? null : "You switched accounts, so the call ended.")
}

// ── Group calls going on ────────────────────────────────────────────────────────────────────────────────────────

function syncLive(): void {
  const here = session && session.kind === "group" && session.answered ? session.callId : null
  const live: LiveGroupCall[] = []
  for (const info of groups.values()) {
    if (info.callId === here) continue
    live.push({
      callId: info.callId,
      conversationId: info.conversationId,
      title: info.title,
      people: info.members.map((member) => member.person),
      quiet: info.quiet,
      mine: viewerId !== null && info.members.some((member) => member.userId === viewerId),
      dismissed: dismissed.has(info.callId),
    })
  }
  update({ live })
}

function hearGroupState(callId: string, signal: GroupSignal): void {
  if (signal.live) {
    groups.set(callId, { callId, conversationId: signal.conversationId, title: signal.title, members: signal.members, quiet: signal.quiet })
  } else {
    groups.delete(callId)
    dismissed.delete(callId)
  }
  const current = session
  if (current && current.callId === callId && current.kind === "group") {
    if (state.status === "incoming") {
      if (!signal.live) {
        teardown(current)
        forgetRing(callId)
        settle(null)
        return
      }
      update({ title: signal.title })
    } else if (current.answered && signal.live && signal.members.some((member) => member.deviceId === device())) {
      // Only a list that has this tab in it is newer than this tab's join.
      update({ title: signal.title })
      reconcile(current, signal.members)
    }
  } else if (!signal.live) {
    forgetRing(callId)
  }
  syncLive()
}

// Matches the connections to who is in the call: a connection for each newcomer, none for whoever left.
function reconcile(current: Session, members: GroupMember[]): void {
  const keep = new Set<string>()
  for (const member of members) {
    if (member.deviceId === device()) continue
    const key = `${member.userId}:${member.deviceId}`
    keep.add(key)
    const known = current.peers.get(key)
    if (known) {
      known.person = member.person
      continue
    }
    const offerer = member.seq < current.seq
    const peer = createPeer(current, key, { userId: member.userId, deviceId: member.deviceId }, member.person, offerer)
    if (offerer) makeOffer(current, peer, false)
  }
  for (const [key, peer] of current.peers) {
    if (keep.has(key)) continue
    closePeer(peer)
    current.peers.delete(key)
  }
  if (current.peers.size > 0) stopRingtone()
  refresh(current)
}

// ── Connections ─────────────────────────────────────────────────────────────────────────────────────────────────

function refresh(current: Session): void {
  if (session !== current || state.status === "incoming") return
  const peers = [...current.peers.values()]
  if (current.kind === "dm") {
    const peer = peers[0]
    const status: CallStatus = !current.answered
      ? "outgoing"
      : current.connectedAt === null
        ? "connecting"
        : peer?.status === "reconnecting"
          ? "reconnecting"
          : "active"
    if (status !== state.status) update({ status })
    return
  }
  const status: CallStatus = current.connectedAt !== null ? "active" : peers.length > 0 ? "connecting" : current.hadPeers ? "active" : "outgoing"
  update({ status, tiles: peers.map((peer) => ({ key: peer.key, person: peer.person, status: peer.status })) })
}

function createPeer(current: Session, key: string, ref: CallPeerRef | null, person: EventPerson, offerer: boolean): Peer {
  const pc = new RTCPeerConnection({ iceServers: current.iceServers })
  const audio = new Audio()
  audio.autoplay = true
  const peer: Peer = {
    key,
    ref,
    person,
    offerer,
    pc,
    audio,
    status: "connecting",
    everConnected: false,
    restarted: false,
    lostAt: null,
    remoteSet: false,
    sdpSent: false,
    pendingIce: [],
    connectTimer: null,
    graceTimer: null,
    reconnectTimer: null,
    chain: Promise.resolve(),
    closed: false,
  }
  current.peers.set(key, peer)
  current.hadPeers = true
  if (current.local) {
    for (const track of current.local.getTracks()) pc.addTrack(track, current.local)
  }
  pc.onicecandidate = (event) => {
    // Routes found before the description went out are in it. Later ones follow one by one.
    if (!event.candidate || !event.candidate.candidate || !peer.sdpSent || peer.closed || session !== current) return
    const json = event.candidate.toJSON()
    void send(current, {
      kind: "ice",
      to: peer.ref,
      candidate: { candidate: json.candidate ?? "", sdpMid: json.sdpMid ?? null, sdpMLineIndex: json.sdpMLineIndex ?? null },
    })
  }
  pc.ontrack = (event) => {
    if (peer.closed) return
    // A one-to-one call shows the other person's camera. A group call is voice only.
    if (event.track.kind === "video") {
      if (current.kind === "dm") update({ remoteVideo: event.streams[0] ?? new MediaStream([event.track]), video: true })
      return
    }
    audio.srcObject = event.streams[0] ?? new MediaStream([event.track])
    void audio.play().catch(() => {})
  }
  pc.oniceconnectionstatechange = () => {
    if (peer.closed || session !== current) return
    const ice = pc.iceConnectionState
    if (ice === "connected" || ice === "completed") peerConnected(current, peer)
    else if (ice === "disconnected") peerInterrupted(current, peer)
    else if (ice === "failed") peerFailed(current, peer)
  }
  // In a group each connection gets its own first-connection limit. A one-to-one call has one for the call.
  if (current.kind === "group") {
    peer.connectTimer = window.setTimeout(() => {
      peer.connectTimer = null
      if (!peer.everConnected) peerLost(current, peer)
    }, CALL_CONNECT_MS)
  }
  return peer
}

function closePeer(peer: Peer): void {
  if (peer.closed) return
  peer.closed = true
  peer.connectTimer = clearTimer(peer.connectTimer)
  peer.graceTimer = clearTimer(peer.graceTimer)
  peer.reconnectTimer = clearTimer(peer.reconnectTimer)
  peer.pc.onicecandidate = null
  peer.pc.ontrack = null
  peer.pc.oniceconnectionstatechange = null
  try {
    peer.pc.close()
  } catch {
    // Already closed.
  }
  peer.audio.pause()
  peer.audio.srcObject = null
  if (state.remoteVideo) update({ remoteVideo: null })
}

// Waits for the browser to gather its routes, at most ICE_GATHER_MS, so they go out in one description.
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve()
  return new Promise((resolve) => {
    let timer = 0
    const finish = () => {
      window.clearTimeout(timer)
      pc.removeEventListener("icegatheringstatechange", check)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === "complete") finish()
    }
    timer = window.setTimeout(finish, ICE_GATHER_MS)
    pc.addEventListener("icegatheringstatechange", check)
  })
}

function flushIce(peer: Peer): void {
  for (const candidate of peer.pendingIce.splice(0)) {
    void peer.pc.addIceCandidate(candidate).catch(() => {})
  }
}

function makeOffer(current: Session, peer: Peer, restart: boolean): void {
  if (restart) peer.remoteSet = false
  peer.chain = peer.chain
    .then(async () => {
      if (peer.closed || session !== current) return
      peer.sdpSent = false
      if (restart) peer.pc.restartIce()
      const offer = await peer.pc.createOffer(restart ? { iceRestart: true } : undefined)
      await peer.pc.setLocalDescription(offer)
      await gathered(peer.pc)
      if (peer.closed || session !== current) return
      peer.sdpSent = true
      const result = await send(current, { kind: "offer", to: peer.ref, sdp: peer.pc.localDescription?.sdp ?? offer.sdp ?? "", restart })
      // The person left before the offer reached them. Their departure arrives with the group's next update.
      if (result && !result.ok && current.kind === "dm" && session === current) endLocally(current, result.error)
    })
    .catch(() => {
      if (!peer.closed && session === current) peerLost(current, peer)
    })
}

function onOffer(current: Session, signal: OfferSignal): void {
  if (current.kind === "dm" && !current.local) return
  const key = current.kind === "dm" ? DM_PEER : `${signal.from.userId}:${signal.from.deviceId}`
  let peer = current.peers.get(key)
  if (peer?.closed) {
    // The connection was given up here, but they are trying again: start it fresh.
    current.peers.delete(key)
    peer = undefined
  }
  // In a one-to-one call, an offer on a connection that is already set up is a renegotiation, such as a camera started
  // mid-call. Only the person called makes the first offer's answer, so that case is checked on its own.
  const renegotiating = current.kind === "dm" && peer !== undefined && peer.remoteSet
  if (current.kind === "dm" && !renegotiating && (current.role !== "callee" || !current.answered)) return
  if (!peer) {
    const person = current.kind === "dm" ? current.other : signal.person
    if (!person) return
    peer = createPeer(current, key, current.kind === "dm" ? null : signal.from, person, false)
    refresh(current)
  }
  if (peer.offerer && !renegotiating) return
  if (signal.restart) {
    peer.restarted = true
    armReconnect(current, peer)
  }
  const target = peer
  // When both sides offer at once, the caller keeps its own offer and the person called yields, so one answer settles it.
  const polite = current.kind === "dm" && current.role === "callee"
  if (!renegotiating) target.remoteSet = false
  target.chain = target.chain
    .then(async () => {
      if (target.closed || session !== current) return
      if (renegotiating && !polite && target.pc.signalingState !== "stable") return
      await target.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp })
      target.remoteSet = true
      flushIce(target)
      target.sdpSent = false
      const answer = await target.pc.createAnswer()
      await target.pc.setLocalDescription(answer)
      await gathered(target.pc)
      if (target.closed || session !== current) return
      target.sdpSent = true
      await send(current, { kind: "answer", to: target.ref, sdp: target.pc.localDescription?.sdp ?? answer.sdp ?? "" })
    })
    .catch(() => {
      if (!target.closed && session === current) peerLost(current, target)
    })
}

function onAnswer(current: Session, signal: AnswerSignal): void {
  const peer = current.peers.get(current.kind === "dm" ? DM_PEER : `${signal.from.userId}:${signal.from.deviceId}`)
  // A one-to-one call answers an offer from either side, since a camera can be started by the person called too.
  if (!peer || peer.closed || (current.kind === "group" && !peer.offerer)) return
  peer.chain = peer.chain
    .then(async () => {
      // A second answer, or one for an offer already replaced, is ignored.
      if (peer.closed || session !== current || peer.pc.signalingState !== "have-local-offer") return
      await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp })
      peer.remoteSet = true
      flushIce(peer)
    })
    .catch(() => {
      if (!peer.closed && session === current) peerLost(current, peer)
    })
}

// Routes can arrive before the description they belong to, so they wait for it.
function onIce(current: Session, signal: IceSignal): void {
  const peer = current.peers.get(current.kind === "dm" ? DM_PEER : `${signal.from.userId}:${signal.from.deviceId}`)
  if (!peer || peer.closed) return
  const init: RTCIceCandidateInit = { candidate: signal.candidate.candidate, sdpMid: signal.candidate.sdpMid, sdpMLineIndex: signal.candidate.sdpMLineIndex }
  if (!peer.remoteSet) {
    peer.pendingIce.push(init)
    return
  }
  void peer.pc.addIceCandidate(init).catch(() => {})
}

function peerConnected(current: Session, peer: Peer): void {
  peer.graceTimer = clearTimer(peer.graceTimer)
  peer.reconnectTimer = clearTimer(peer.reconnectTimer)
  peer.connectTimer = clearTimer(peer.connectTimer)
  peer.status = "connected"
  peer.everConnected = true
  peer.lostAt = null
  // Back on its feet: a later drop gets its own new route.
  peer.restarted = false
  if (current.connectedAt === null) {
    current.connectedAt = Date.now()
    current.connectTimer = clearTimer(current.connectTimer)
    stopRingtone()
    update({ connectedAt: current.connectedAt })
  }
  if (!current.reported) {
    current.reported = true
    void send(current, { kind: "connected" })
  }
  refresh(current)
}

function armReconnect(current: Session, peer: Peer): void {
  if (peer.reconnectTimer !== null) return
  peer.reconnectTimer = window.setTimeout(() => {
    peer.reconnectTimer = null
    if (!peer.closed && session === current && peer.status !== "connected") peerLost(current, peer)
  }, CALL_RECONNECT_MS)
}

// The connection dropped. The side that made the offer waits a moment for the network to settle, then looks for a new
// route once. Both sides give it CALL_RECONNECT_MS in all.
function peerInterrupted(current: Session, peer: Peer): void {
  if (!peer.everConnected) return
  if (peer.status !== "reconnecting") {
    peer.status = "reconnecting"
    peer.lostAt = Date.now()
  }
  armReconnect(current, peer)
  if (peer.offerer && !peer.restarted && peer.graceTimer === null) {
    peer.graceTimer = window.setTimeout(() => {
      peer.graceTimer = null
      if (peer.closed || session !== current) return
      const ice = peer.pc.iceConnectionState
      if (ice === "disconnected" || ice === "failed") restartPeer(current, peer)
    }, CALL_RESTART_WAIT_MS)
  }
  refresh(current)
}

function peerFailed(current: Session, peer: Peer): void {
  if (!peer.everConnected || peer.restarted) {
    // It never came up, or the new route failed as well.
    peerLost(current, peer)
    return
  }
  if (peer.status !== "reconnecting") {
    peer.status = "reconnecting"
    peer.lostAt = Date.now()
  }
  armReconnect(current, peer)
  if (peer.offerer) {
    peer.graceTimer = clearTimer(peer.graceTimer)
    restartPeer(current, peer)
  }
  refresh(current)
}

function restartPeer(current: Session, peer: Peer): void {
  if (peer.closed || session !== current) return
  if (peer.restarted) {
    peerLost(current, peer)
    return
  }
  peer.restarted = true
  armReconnect(current, peer)
  makeOffer(current, peer, true)
}

// A connection is gone for good. A one-to-one call ends. In a group only that person's tile says so, and the call ends
// here once nobody is left to talk to.
function peerLost(current: Session, peer: Peer): void {
  if (peer.closed || session !== current) return
  const lostMs = peer.lostAt !== null ? Date.now() - peer.lostAt : 0
  if (current.kind === "dm") {
    leave(current, peer.everConnected ? DROPPED : NO_CONNECT, peer.everConnected ? lostMs : 0)
    return
  }
  closePeer(peer)
  peer.status = "failed"
  const peers = [...current.peers.values()]
  if (!peers.some((other) => !other.closed)) {
    leave(current, peers.some((other) => other.everConnected) ? DROPPED : NO_CONNECT, lostMs)
    return
  }
  refresh(current)
}

// ── The call in this tab ────────────────────────────────────────────────────────────────────────────────────────

// Releases the microphone and the connections on this side. Nothing is sent to anyone here.
function teardown(current: Session): void {
  if (session === current) session = null
  stopRingtone()
  current.connectTimer = clearTimer(current.connectTimer)
  if (current.beat !== null) window.clearInterval(current.beat)
  current.beat = null
  for (const peer of current.peers.values()) closePeer(peer)
  current.peers.clear()
  stopStream(current.local)
  current.local = null
}

function endLocally(current: Session, note: string | null): void {
  teardown(current)
  forgetRing(current.callId)
  settle(note)
}

// Ends the call from this side and tells the server. In a group that is leaving it.
function leave(current: Session, note: string | null, lostMs = 0): void {
  void send(current, lostMs > 0 ? { kind: "end", lostMs } : { kind: "end" })
  endLocally(current, note)
}

function armConnect(current: Session): void {
  if (current.connectTimer !== null) return
  current.connectTimer = window.setTimeout(() => {
    current.connectTimer = null
    if (session === current && current.connectedAt === null) leave(current, NO_CONNECT)
  }, CALL_CONNECT_MS)
}

function startBeat(current: Session): void {
  if (current.beat !== null) return
  current.beat = window.setInterval(() => void beat(current), CALL_HEARTBEAT_MS)
}

async function beat(current: Session): Promise<void> {
  let result: BeatResult
  try {
    result = await callHeartbeat(current.callId, device())
  } catch {
    // Offline for a moment. The connection's own timers decide.
    return
  }
  if (session !== current || result.ok) return
  endLocally(current, current.boot !== null && result.bootId !== current.boot ? RESTARTED : GONE)
}

// Signals that arrive before this tab's call is set up wait here briefly, then play once it is.
function stash(callId: string, signal: CallSignal): void {
  if (signal.kind !== "accept" && signal.kind !== "decline" && signal.kind !== "offer" && signal.kind !== "answer" && signal.kind !== "ice") return
  const now = Date.now()
  for (const [id, items] of early) {
    if (now - items[0].at > EARLY_KEEP_MS) early.delete(id)
  }
  const items = early.get(callId) ?? []
  if (items.length < 40) items.push({ signal, at: now })
  early.set(callId, items)
}

function replay(current: Session): void {
  const items = early.get(current.callId)
  early.delete(current.callId)
  for (const item of items ?? []) receiveCallEvent({ type: "call", callId: current.callId, signal: item.signal })
}

// The person called answered: the caller makes the offer.
function callerAnswered(current: Session): void {
  current.answered = true
  stopRingtone()
  armConnect(current)
  startBeat(current)
  const other = current.other
  if (!other) {
    leave(current, NO_CONNECT)
    return
  }
  const peer = createPeer(current, DM_PEER, null, other, true)
  makeOffer(current, peer, false)
  refresh(current)
}

function endNote(current: Session, reason: CallEndReason, seconds: number): string | null {
  switch (reason) {
    case "ended":
      return current.kind === "dm" ? `Call ended · ${formatDuration(seconds)}` : "Call ended"
    case "missed":
      return current.role === "caller" ? "No answer" : current.answered ? GONE : null
    case "declined":
      return current.role === "caller" ? "Declined" : null
    case "failed":
      return NO_CONNECT
    case "dropped":
      return DROPPED
    case "nobody":
      return "No one joined."
    case "signed-out":
      return "You signed out, so the call ended."
    case "deactivated":
      return "Your account was deactivated, so the call ended."
    case "deleted":
      return "Your account was deleted, so the call ended."
    case "left":
      return "You left the conversation, so the call ended."
    case "removed":
      return "You were removed from the group, so the call ended."
    case "moved":
      return "You joined this call on another device."
    case "blocked":
      return "You can't stay in this call."
  }
}

function hearRing(callId: string, signal: Extract<CallSignal, { kind: "ring" }>): void {
  const ring = ringEntry(callId)
  if (ring.info) return
  ring.info = {
    kind: signal.call,
    conversationId: signal.conversationId,
    from: signal.from,
    title: signal.title,
    iceServers: signal.iceServers,
    video: signal.video === true,
  }
  // Already on a call here: this tab stays quiet and another can ring.
  elect(ring)
}

function hearClaimed(callId: string, by: string): void {
  if (by === device()) return
  // While this tab is answering, its own answer decides.
  if (session?.callId === callId && state.accepting) return
  forgetRing(callId)
  const current = session
  if (current && current.callId === callId && state.status === "incoming") quietHere(current)
}

function hearEnd(callId: string, reason: CallEndReason, seconds: number): void {
  const current = session
  if (current && current.callId === callId && state.status === "incoming") {
    // A group ring that ran out while it was being answered: the join decides.
    if (state.accepting && current.kind === "group" && reason === "missed") return
    forgetRing(callId)
    quietHere(current)
    return
  }
  forgetRing(callId)
  if (!current || current.callId !== callId) return
  endLocally(current, endNote(current, reason, seconds))
}

// Realtime steps for calls: rings, group updates, and the steps of the call in this tab.
export function receiveCallEvent(event: Extract<RealtimeEvent, { type: "call" }>): void {
  if (typeof window === "undefined") return
  if (event.device && event.device !== device()) return
  const { callId, signal } = event
  switch (signal.kind) {
    case "ring":
      hearRing(callId, signal)
      return
    case "group":
      hearGroupState(callId, signal)
      return
    case "claimed":
      hearClaimed(callId, signal.device)
      return
    case "end":
      hearEnd(callId, signal.reason, signal.seconds)
      return
  }
  const current = session
  if (!current || current.callId !== callId || state.status === "incoming") {
    stash(callId, signal)
    return
  }
  switch (signal.kind) {
    case "accept":
      if (current.role === "caller" && !current.answered) callerAnswered(current)
      return
    case "decline":
      if (current.role === "caller") endLocally(current, "Declined")
      return
    case "offer":
      onOffer(current, signal)
      return
    case "answer":
      onAnswer(current, signal)
      return
    case "ice":
      onIce(current, signal)
      return
  }
}

// The stream's first event. A new boot id means the server restarted and every call it knew is gone.
export function receiveHello(next: string): void {
  if (typeof window === "undefined") return
  const previous = bootId
  bootId = next
  if (previous === null || previous === next) return
  for (const ring of rings.values()) ring.timer = clearTimer(ring.timer)
  rings.clear()
  early.clear()
  groups.clear()
  dismissed.clear()
  const current = session
  if (current && current.boot !== next) {
    if (state.status === "incoming") quietHere(current)
    else endLocally(current, RESTARTED)
    return
  }
  syncLive()
}

// ── What the call controls do ───────────────────────────────────────────────────────────────────────────────────

// Rings the other person in a one-to-one chat. If they are ringing you already, this answers them.
export async function placeCall(conversationId: string, peer: EventPerson, video = false): Promise<Placed> {
  const ringing = session
  if (ringing && state.status === "incoming" && ringing.kind === "dm" && ringing.conversationId === conversationId) {
    await acceptCall()
    return { ok: true }
  }
  const busy = busyError()
  if (busy) return { ok: false, error: busy }
  starting = true
  let mic: MediaStream | null = null
  let kept = false
  try {
    const got = await microphone("call", video)
    if (typeof got === "string") return { ok: false, error: got }
    mic = got
    const started = await startCall(conversationId, device(), video)
    if (!started.ok) {
      if (started.unavailable) {
        settle(started.error, { kind: "dm", conversationId, peer, title: null })
        return { ok: true }
      }
      return { ok: false, error: started.error }
    }
    const answered = started.mode === "answered"
    const current: Session = {
      kind: "dm",
      role: answered ? "callee" : "caller",
      callId: started.callId,
      conversationId,
      iceServers: started.iceServers,
      local: mic,
      peers: new Map(),
      seq: 0,
      hadPeers: false,
      other: answered ? started.peer : peer,
      video: hasVideo(mic),
      answered,
      connectedAt: null,
      connectTimer: null,
      beat: null,
      boot: started.bootId,
      reported: false,
    }
    kept = true
    clearNote()
    session = current
    forgetRing(started.callId)
    update({
      status: answered ? "connecting" : "outgoing",
      kind: "dm",
      video: hasVideo(mic),
      localVideo: videoOf(mic),
      remoteVideo: null,
      cameraOff: false,
      cameraStarting: false,
      callId: started.callId,
      conversationId,
      peer: current.other,
      title: null,
      tiles: [],
      muted: false,
      accepting: false,
      connectedAt: null,
      note: null,
    })
    if (answered) {
      // They were calling you at the same moment: this answered their call.
      armConnect(current)
      startBeat(current)
    } else {
      startRingtone("outgoing")
    }
    replay(current)
    return { ok: true }
  } catch {
    return { ok: false, error: OFFLINE }
  } finally {
    if (!kept) stopStream(mic)
    starting = false
    if (!session) reconsiderRings()
  }
}

// Starts a group call, or joins the one going on in that group.
export function placeGroupCall(conversationId: string): Promise<Placed> {
  return enterGroup(() => startGroupCall(conversationId, device()))
}

// Joins a group call that is going on, from a Join banner or the group's call button.
export async function joinLiveCall(callId: string): Promise<Placed> {
  const ringing = session
  if (ringing && ringing.callId === callId && state.status === "incoming") {
    await acceptCall()
    return { ok: true }
  }
  return enterGroup(() => joinGroupAction(callId, device()))
}

// Why this tab cannot start or join a call right now, if it cannot.
function busyError(): string | null {
  if (session && state.status === "incoming") return "Answer or decline the incoming call first."
  if (session || starting) return "You're already on a call."
  return null
}

async function enterGroup(run: () => Promise<JoinedCall>): Promise<Placed> {
  const busy = busyError()
  if (busy) return { ok: false, error: busy }
  starting = true
  let mic: MediaStream | null = null
  let kept = false
  try {
    const got = await microphone("call")
    if (typeof got === "string") return { ok: false, error: got }
    mic = got
    const result = await run()
    if (!result.ok) return { ok: false, error: result.error }
    const current: Session = {
      kind: "group",
      role: "member",
      callId: result.callId,
      conversationId: result.conversationId,
      iceServers: result.iceServers,
      local: mic,
      peers: new Map(),
      seq: result.seq,
      hadPeers: false,
      other: null,
      answered: true,
      connectedAt: null,
      connectTimer: null,
      beat: null,
      boot: result.bootId,
      reported: false,
      video: false,
    }
    kept = true
    clearNote()
    session = current
    forgetRing(result.callId)
    update({
      status: result.members.length > 0 ? "connecting" : "outgoing",
      kind: "group",
      callId: result.callId,
      conversationId: result.conversationId,
      peer: null,
      title: result.title,
      tiles: [],
      muted: false,
      accepting: false,
      connectedAt: null,
      note: null,
    })
    if (result.members.length === 0) startRingtone("outgoing")
    beginGroup(current, result.members)
    return { ok: true }
  } catch {
    return { ok: false, error: OFFLINE }
  } finally {
    if (!kept) stopStream(mic)
    starting = false
    if (!session) reconsiderRings()
  }
}

// In the call: an offer to everyone already there, then whatever changed since.
function beginGroup(current: Session, members: GroupMember[]): void {
  startBeat(current)
  for (const member of members) {
    const peer = createPeer(current, `${member.userId}:${member.deviceId}`, { userId: member.userId, deviceId: member.deviceId }, member.person, true)
    makeOffer(current, peer, false)
  }
  const latest = groups.get(current.callId)
  if (latest && latest.members.some((member) => member.deviceId === device())) reconcile(current, latest.members)
  else refresh(current)
  syncLive()
  replay(current)
}

// Answers the ring in this tab. The microphone is asked for first, so the call never connects silent.
export async function acceptCall(): Promise<void> {
  const current = session
  if (!current || state.status !== "incoming" || state.accepting || current.answered) return
  update({ accepting: true, note: null })
  let mic: MediaStream | null = null
  let kept = false
  try {
    const got = await microphone("answer", current.video)
    if (session !== current) return
    if (typeof got === "string") {
      // The ring keeps going, so the person can allow the microphone and answer, or decline.
      update({ note: got })
      return
    }
    mic = got
    if (current.kind === "dm") {
      current.local = mic
      current.video = hasVideo(mic)
      kept = true
      current.answered = true
      stopRingtone()
      update({ status: "connecting", accepting: false, video: current.video, localVideo: videoOf(mic) })
      armConnect(current)
      const result = await sendCallSignal(current.callId, device(), { kind: "accept" })
      if (session !== current) return
      if (!result.ok) {
        endLocally(current, result.error)
        return
      }
      startBeat(current)
      replay(current)
      return
    }
    const result = await joinGroupAction(current.callId, device())
    if (session !== current) {
      // The ring ended here while the join went through: leave again rather than stay in silently.
      if (result.ok) void sendCallSignal(result.callId, device(), { kind: "end" }).catch(() => {})
      return
    }
    if (!result.ok) {
      endLocally(current, result.error)
      return
    }
    current.local = mic
    kept = true
    current.answered = true
    current.seq = result.seq
    current.iceServers = result.iceServers
    current.boot = result.bootId
    stopRingtone()
    update({ status: result.members.length > 0 ? "connecting" : "active", title: result.title, peer: null, accepting: false })
    beginGroup(current, result.members)
  } catch {
    if (session === current) endLocally(current, OFFLINE)
  } finally {
    if (!kept) stopStream(mic)
    if (state.accepting) update({ accepting: false })
  }
}

// Turns the ring down here. Every tab and device that rang stops.
export function declineCall(): void {
  const current = session
  if (!current || state.status !== "incoming" || state.accepting) return
  void send(current, { kind: "decline" })
  if (current.kind === "group") dismissLiveCall(current.callId)
  forgetRing(current.callId)
  teardown(current)
  settle(null)
}

// Leaves the call. Before a one-to-one call connects, that cancels it.
export function hangUp(): void {
  const current = session
  if (!current) return
  if (state.status === "incoming") {
    declineCall()
    return
  }
  if (current.kind === "group") {
    leave(current, state.status === "outgoing" ? null : "You left the call.")
    return
  }
  const connectedAt = current.connectedAt
  leave(current, connectedAt ? `Call ended · ${formatDuration((Date.now() - connectedAt) / 1000)}` : null)
}

// Mutes this side only: the microphone track stops sending, in every connection of the call.
// Turns this person's camera on in a one-to-one call that started as voice only. The camera joins the connection that is
// already up, and the other person gets a new offer, so their picture appears. The call itself carries on for both.
export async function startCamera(): Promise<Placed> {
  const current = session
  if (!current || current.kind !== "dm" || !current.local) return { ok: false, error: "The camera can start during a one-to-one call." }
  if (state.status !== "active" && state.status !== "connecting" && state.status !== "reconnecting") {
    return { ok: false, error: "The camera can start once the call is connected." }
  }
  if (state.localVideo || state.cameraStarting) return { ok: true }
  update({ cameraStarting: true })
  let track: MediaStreamTrack | null = null
  try {
    track = (await navigator.mediaDevices.getUserMedia({ video: CAMERA })).getVideoTracks()[0] ?? null
  } catch {
    track = null
  }
  if (session !== current) {
    track?.stop()
    return { ok: false, error: GONE }
  }
  if (!track) {
    update({ cameraStarting: false })
    return { ok: false, error: "Couldn't start your camera. Check that the browser is allowed to use it." }
  }
  current.local.addTrack(track)
  for (const peer of current.peers.values()) {
    if (peer.closed) continue
    try {
      peer.pc.addTrack(track, current.local)
    } catch {
      continue
    }
    makeOffer(current, peer, false)
  }
  update({ cameraStarting: false, video: true, localVideo: videoOf(current.local), cameraOff: false })
  return { ok: true }
}

// Turns this person's camera picture off for the other person, and back on. The call itself is not affected.
export function toggleCamera(): void {
  const track = session?.local?.getVideoTracks()[0]
  if (!track) return
  track.enabled = !track.enabled
  update({ cameraOff: !track.enabled })
}

export function toggleMute(): void {
  const current = session
  if (!current?.local) return
  const next = !state.muted
  for (const track of current.local.getAudioTracks()) track.enabled = !next
  update({ muted: next })
}

// Hides the Join banner for a group call, in every tab of this browser.
export function dismissLiveCall(callId: string): void {
  dismissed.add(callId)
  post({ t: "dismiss", callId })
  syncLive()
}
