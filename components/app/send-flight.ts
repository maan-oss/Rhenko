// A message you send leaves the place you sent it from and flies into the chat in a straight line. The words lift out of the
// message box and turn into the bubble on the way; a photo or video leaves its preview and grows into the bubble around it.
// Ported from Parley's lib/send-flight.ts.
//
// One progress value drives everything the copy does at once: where it is, how big it is, its colours and, for a photo, its
// frame. So it moves along a single straight line from where it starts to the bubble, and never sideways first. Only one
// copy is ever drawn, so no word or picture shows twice. The real bubble stays hidden until the copy lands, and is shown in
// the same frame the copy is removed, so the swap does not flicker.
//
// Words: the composer arms a flight (armText) just before it sends, and the pending bubble takes it when it mounts (launch).
// A photo or video: the composer starts the copy at once (startPicture), so the preview never just vanishes. Either way the
// copy flies to the real bubble on each frame. The saved bubble arrives after the pending one has gone; receive() hands the
// flight to it, so the copy never stops short. With reduced motion, nothing flies.

type Rect = { left: number; top: number; width: number; height: number }

export type FlightOrigin =
  // The words in the box: where their first line starts, the line height they sit on, and their colour.
  | { kind: "text"; x: number; y: number; lineHeight: number; color: string }
  // A photo or video: the preview it leaves from, and the preview element itself, copied so the picture flies with it.
  | { kind: "picture"; rect: Rect; source: HTMLElement }

interface Armed {
  origin: FlightOrigin
  at: number
}

// A bubble of yours that has just arrived in a chat, where a flight still on its way may land.
interface Arrival {
  chatId: string
  bubble: HTMLElement
  picture: HTMLElement | null
  at: number
}

// A copy in the air.
interface Flight {
  chatId: string
  kind: "text" | "picture"
  ghost: HTMLElement
  // The bubble the copy lands on, once it has one, and the photo inside it, which must have loaded before the copy moves.
  target: HTMLElement | null
  picture: HTMLElement | null
  // The real bubble, hidden until the copy lands.
  hidden: HTMLElement | null
  // The bubble's padding and corner, which a photo's copy grows into.
  pad: { x: number; y: number }
  radius: number
  // Whether the copy has a landing it can move to. It holds still until then.
  moving: boolean
  // Where the copy is heading: the landing, kept while the bubble is between replacements.
  to: Rect
  // The landing as it was last frame, and how many frames it has held still.
  seen: Rect | null
  steady: number
  lostAt: number | null
  onLanded?: () => void
}

// A flight not taken this soon after it was armed is dropped (the send did not make a bubble here).
const TTL = 6000
// A words flight whose pending bubble has gone waits this long after landing for the saved one to take it on.
const ORPHAN_WAIT = 1500
// A photo's copy waits this long, from the send, for its message to arrive and its picture to load.
const PICTURE_WAIT = 9000
// A new bubble of yours is held hidden this long for a flight to claim it, then shows as usual.
const ARRIVAL_TTL = 3000
// A photo's own corner (rounded-xl), which its copy keeps while it grows.
const CORNER = 12
// How much of the way the copy turns to follow a bubble that has moved, each frame.
const GLIDE = 0.2
// The copy sets off only once its bubble has held still this many frames: a bubble that has just mounted can still be moving
// into place (the thread scrolls to its end as it appears).
const SETTLE_FRAMES = 3
// The copy's spring, critically damped: it reaches the bubble without passing it or swaying back, so the path stays straight.
const STIFFNESS = 210
const DAMPING = 29

const armed = new Map<string, Armed>()
const flights = new Set<Flight>()
const arrivals: Arrival[] = []

function motionOff(): boolean {
  if (typeof window === "undefined") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

const area = (r: Rect) => r.width * r.height

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < window.innerHeight
}

// The words' origin, read from the message box before it clears.
export function textOrigin(ta: HTMLTextAreaElement): FlightOrigin | null {
  if (motionOff()) return null
  const r = ta.getBoundingClientRect()
  const cs = getComputedStyle(ta)
  const lineHeight = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 15) * 1.5
  const rtl = cs.direction === "rtl"
  const x = rtl ? r.right - parseFloat(cs.paddingRight) : r.left + parseFloat(cs.paddingLeft)
  const y = r.top + parseFloat(cs.paddingTop) - ta.scrollTop + lineHeight / 2
  return { kind: "text", x, y, lineHeight, color: cs.color }
}

// A photo or video's origin: the largest visible preview marked as the thing being sent (data-flight-source).
export function placeOrigin(): FlightOrigin | null {
  if (motionOff()) return null
  const sources = [...document.querySelectorAll<HTMLElement>("[data-flight-source]")].filter(visible)
  if (sources.length === 0) return null
  const big = sources.reduce((a, b) => (area(rectOf(a)) >= area(rectOf(b)) ? a : b))
  return { kind: "picture", rect: rectOf(big), source: big }
}

export function armText(id: string, origin: FlightOrigin | null) {
  if (origin?.kind === "text") armed.set(id, { origin, at: Date.now() })
}

// Whether a words flight waits for this pending message. Asked while it first draws, so its bubble can start hidden.
export function hasFlight(id: string): boolean {
  if (motionOff()) return false
  const own = armed.get(id)
  return !!own && Date.now() - own.at < TTL
}

function take(id: string): FlightOrigin | null {
  const own = armed.get(id)
  armed.delete(id)
  return own && Date.now() - own.at < TTL ? own.origin : null
}

// One spring, integrated in small steps so it is steady at any frame rate. It runs from 0 to 1 and does not overshoot.
function spring(stiffness: number, damping: number) {
  let x = 0
  let v = 0
  return {
    step(dt: number) {
      for (let t = 0; t < dt; t += 1 / 240) {
        const h = Math.min(1 / 240, dt - t)
        v += (-stiffness * (x - 1) - damping * v) * h
        x += v * h
      }
      return x
    },
    get done() {
      return Math.abs(1 - x) < 0.0015 && Math.abs(v) < 0.01
    },
  }
}

// A copy of a bubble as it looks: no ids or test hooks, inert, at the given width.
function copyOf(bubble: HTMLElement, width: number): HTMLElement {
  const copy = bubble.cloneNode(true) as HTMLElement
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    for (const a of [...el.attributes]) if (a.name === "id" || a.name.startsWith("data-")) el.removeAttribute(a.name)
    el.removeAttribute("tabindex")
  }
  copy.setAttribute("inert", "")
  copy.style.cssText = `position:absolute;left:0;top:0;width:${width}px;max-width:none;margin:0;transform:none;opacity:1;visibility:visible`
  return copy
}

function makeGhost(from: Rect): HTMLElement {
  const ghost = document.createElement("div")
  ghost.setAttribute("aria-hidden", "true")
  ghost.setAttribute("data-flight", "")
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${from.width}px`,
    height: `${from.height}px`,
    transform: `translate3d(${from.left}px, ${from.top}px, 0)`,
    transformOrigin: "0 0",
    pointerEvents: "none",
    zIndex: "45",
    willChange: "transform",
  })
  return ghost
}

function newFlight(chatId: string, kind: "text" | "picture", ghost: HTMLElement, from: Rect, onLanded?: () => void): Flight {
  return {
    chatId,
    kind,
    ghost,
    target: null,
    picture: null,
    hidden: null,
    pad: { x: 0, y: 0 },
    radius: CORNER,
    moving: false,
    to: from,
    seen: null,
    steady: 0,
    lostAt: null,
    onLanded,
  }
}

// The copy's rectangle a part of the way from where it started to where it is heading. Every edge and the size use the same
// part, so the copy's corner runs in a straight line.
function between(from: Rect, to: Rect, p: number): Rect {
  return {
    left: from.left + (to.left - from.left) * p,
    top: from.top + (to.top - from.top) * p,
    width: from.width + (to.width - from.width) * p,
    height: from.height + (to.height - from.height) * p,
  }
}

function sameRect(a: Rect, b: Rect): boolean {
  return Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5
}

// A colour a part of the way from one colour to another, mixed by the browser (so any colour the page uses works).
function mix(a: string, b: string, p: number): string {
  if (p <= 0) return a
  if (p >= 1) return b
  return `color-mix(in srgb, ${b} ${(p * 100).toFixed(2)}%, ${a})`
}

// The newest bubble of this chat that a flight may land on, taken off the list.
function claimArrival(chatId: string): Arrival | null {
  const now = Date.now()
  const i = arrivals.findIndex((a) => a.chatId === chatId && a.bubble.isConnected && now - a.at < ARRIVAL_TTL)
  return i < 0 ? null : arrivals.splice(i, 1)[0]
}

// The flight lands on this bubble from now on. The bubble stays hidden until the copy has landed.
function attach(f: Flight, a: Arrival) {
  const cs = getComputedStyle(a.bubble)
  f.target = a.bubble
  f.picture = a.picture
  f.hidden = a.bubble
  f.pad = { x: parseFloat(cs.paddingLeft) || 0, y: parseFloat(cs.paddingTop) || 0 }
  f.radius = parseFloat(cs.borderTopLeftRadius) || CORNER
  f.lostAt = null
  if (f.kind === "picture") f.ghost.style.background = cs.backgroundColor
  a.bubble.style.visibility = "hidden"
}

// A photo can be landed on once its picture has loaded, so it is the right size and not a placeholder.
function ready(f: Flight): boolean {
  const picture = f.picture
  return !(picture instanceof HTMLImageElement) || (picture.complete && picture.naturalWidth > 0)
}

// Flies a flight's copy frame by frame. `paint` draws the copy at progress p (0 at the start, 1 at the landing) towards `to`.
// It ends once it has landed, or after waiting too long for a bubble to land on.
function run(f: Flight, paint: (p: number, to: Rect) => void) {
  flights.add(f)
  const sp = spring(STIFFNESS, DAMPING)
  const t0 = performance.now()
  let last = t0
  let raf = 0
  // Slow motion for checking the flight by eye (set window.__flightSlow = 5 in the console).
  const slow = Math.max(1, Number((window as unknown as { __flightSlow?: number }).__flightSlow) || 1)

  const end = () => {
    cancelAnimationFrame(raf)
    flights.delete(f)
    if (f.hidden) f.hidden.style.visibility = ""
    f.ghost.remove()
    f.onLanded?.()
  }

  const frame = (now: number) => {
    const dt = Math.min(0.034, (now - last) / 1000) / slow
    last = now

    // Whatever bubble the copy is heading for may have been replaced (a pending bubble gives way to the saved one): take the
    // next bubble of this chat, if one has arrived.
    if (!(f.target && f.target.isConnected)) {
      const next = claimArrival(f.chatId)
      if (next) attach(f, next)
    }
    const landing = f.target && f.target.isConnected ? f.target : null
    if (landing) {
      f.lostAt = null
      if (ready(f)) {
        const live = rectOf(landing)
        f.steady = f.seen && sameRect(f.seen, live) ? f.steady + 1 : 0
        f.seen = live
        // The copy sets off once the bubble is in place, aiming straight at it. After that it glides after the bubble, so a
        // bubble that moves on (the saved one takes the pending one's place, or the thread scrolls) turns the path gently.
        if (!f.moving && f.steady >= SETTLE_FRAMES) {
          f.to = live
          f.moving = true
        } else if (f.moving) {
          f.to = between(f.to, live, GLIDE)
        }
      }
    } else if (f.lostAt === null) {
      f.lostAt = now
    }
    const waiting = f.kind === "picture" && !f.moving
    const gaveUp = waiting
      ? now - t0 > PICTURE_WAIT
      : !landing && (now - t0 > TTL || (sp.done && f.lostAt !== null && now - f.lostAt > ORPHAN_WAIT))
    if (gaveUp) return end()

    const x = f.moving ? sp.step(dt) : 0
    const arrived = f.moving && landing !== null && sp.done
    paint(arrived ? 1 : x, f.to)
    if (arrived) return end()
    raf = requestAnimationFrame(frame)
  }
  paint(0, f.to)
  raf = requestAnimationFrame(frame)
}

// Starts the flight for a pending message that has just mounted, if words were armed for it. Returns whether it flies.
// `onLanded` runs when the copy has landed (or gave up), so the pending bubble can show its caption again.
export function launch(bubble: HTMLElement, id: string, chatId: string, onLanded?: () => void): boolean {
  if (motionOff()) return false
  const origin = take(id)
  if (!origin || origin.kind !== "text") return false
  const start = bubble.getBoundingClientRect()
  if (!start.width || !start.height) return false

  // The copy is the bubble itself, so it wraps its words exactly as the bubble does from its first frame. It starts looking
  // like the words in the box (no fill, the box's colour) and turns into the bubble's fill and colour as it travels.
  let x0 = origin.x
  let y0 = origin.y - origin.lineHeight / 2
  const words = bubble.querySelector<HTMLElement>("[data-flight-text]")
  if (words) {
    const w = words.getBoundingClientRect()
    const lineHeight = parseFloat(getComputedStyle(words).lineHeight) || origin.lineHeight
    x0 = origin.x - (w.left - start.left)
    y0 = origin.y - (w.top - start.top + lineHeight / 2)
  }
  const from: Rect = { left: x0, top: y0, width: start.width, height: start.height }

  // The bubble's colours, read now: its live style goes blank once the pending bubble unmounts (when the saved one arrives).
  const cs = getComputedStyle(bubble)
  const fill = cs.backgroundColor
  const ink = cs.color
  const ghost = makeGhost(from)
  const copy = copyOf(bubble, start.width)
  copy.style.backgroundColor = "transparent"
  copy.style.color = origin.color
  ghost.appendChild(copy)

  bubble.style.visibility = "hidden"
  document.body.appendChild(ghost)
  const f = newFlight(chatId, "text", ghost, from, onLanded)
  f.target = bubble
  f.hidden = bubble

  run(f, (p, to) => {
    const r = between(from, to, p)
    ghost.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`
    ghost.style.width = `${r.width}px`
    ghost.style.height = `${r.height}px`
    copy.style.width = `${r.width}px`
    copy.style.height = `${r.height}px`
    copy.style.backgroundColor = mix("transparent", fill, p)
    copy.style.color = mix(origin.color, ink, p)
  })
  return true
}

// A photo or video leaves its preview at once: the copy starts where the preview is, so the picture never just vanishes.
// It waits there until the saved message is in the chat (receive), then grows into the bubble. Called as Send is pressed,
// before the preview is cleared.
export function startPicture(chatId: string, origin: FlightOrigin | null) {
  if (!origin || origin.kind !== "picture" || motionOff()) return
  const from = origin.rect
  const ghost = makeGhost(from)
  Object.assign(ghost.style, { boxSizing: "border-box", overflow: "hidden", borderRadius: `${CORNER}px` })

  // The preview's own picture, copied: a photo, or a video's first frame (silent).
  const copy = copyOf(origin.source, from.width)
  copy.style.cssText = `display:block;width:100%;height:100%;object-fit:cover;margin:0;max-width:none;max-height:none;border-radius:${CORNER}px`
  if (copy instanceof HTMLVideoElement) copy.muted = true
  ghost.appendChild(copy)
  document.body.appendChild(ghost)

  // The preview is hidden while its copy is in the air, so the picture is not shown twice. It comes back when the flight ends,
  // which is only still needed if the send failed (on success the preview is cleared).
  const source = origin.source
  const shown = source.style.visibility
  source.style.visibility = "hidden"

  const f = newFlight(chatId, "picture", ghost, from, () => {
    source.style.visibility = shown
  })
  run(f, (p, to) => {
    const r = between(from, to, p)
    ghost.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`
    ghost.style.width = `${r.width}px`
    ghost.style.height = `${r.height}px`
    // The bubble's own padding and corner come in as it grows, so the picture settles inside the bubble's frame.
    ghost.style.padding = `${f.pad.y * p}px ${f.pad.x * p}px`
    ghost.style.borderRadius = `${CORNER + (f.radius - CORNER) * p}px`
  })
}

// A bubble of yours has just arrived in this chat. A flight still on its way lands on it. Until a flight claims it, the
// bubble stays hidden, for a moment at most; with no flight on its way it shows as usual.
export function receive(chatId: string, bubble: HTMLElement, picture: HTMLElement | null) {
  if (motionOff()) return
  if (![...flights].some((f) => f.chatId === chatId)) return
  const arrival: Arrival = { chatId, bubble, picture, at: Date.now() }
  arrivals.push(arrival)
  bubble.style.visibility = "hidden"
  window.setTimeout(() => {
    const i = arrivals.indexOf(arrival)
    if (i < 0) return
    arrivals.splice(i, 1)
    bubble.style.visibility = ""
  }, ARRIVAL_TTL)
}
