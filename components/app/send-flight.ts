// A message you send leaves the place you sent it from and flies into the chat. The words lift out of the message box and
// turn into the bubble on the way; a photo or video leaves its preview and grows into the bubble around it. Ported from
// Parley's lib/send-flight.ts.
//
// Words: the composer arms a flight (armText) just before it sends, and the pending bubble takes it when it mounts (launch).
// A photo or video: the composer starts the copy at once (startPicture), so the preview never just vanishes. Either way the
// copy flies to the real bubble on each frame, and the real bubble stays hidden until the copy lands. The saved bubble
// arrives after the pending one has gone; receive() hands the flight to it, so the copy never stops short. With reduced
// motion, nothing flies.

type Rect = { left: number; top: number; width: number; height: number }

export type FlightOrigin =
  // The words in the box: where their first line starts, and the line height they sit on.
  | { kind: "text"; x: number; y: number; lineHeight: number }
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
  lostAt: number | null
  onLanded?: () => void
}

// A flight not taken this soon after it was armed is dropped (the send did not make a bubble here).
const TTL = 6000
// A words flight whose pending bubble has gone waits this long for the saved one to take it on.
const ORPHAN_WAIT = 1500
// A photo's copy waits this long, from the send, for its message to arrive and its picture to load.
const PICTURE_WAIT = 9000
// A new bubble of yours is held hidden this long for a flight to claim it, then shows as usual.
const ARRIVAL_TTL = 3000
// A photo's own corner (rounded-xl), which its copy keeps while it grows.
const CORNER = 12

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
  return { kind: "text", x, y, lineHeight }
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

// One spring, integrated in small steps so it is steady at any frame rate. These sit a little under critically damped, so
// the bubble lands with the faintest give.
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

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const easeOut = (n: number) => 1 - (1 - n) ** 3

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

// The opacity the bubble is drawn at, counting the rows around it (the pending row is faded while it is being sent).
function effectiveOpacity(el: HTMLElement): number {
  let opacity = 1
  let node: HTMLElement | null = el
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    opacity *= parseFloat(getComputedStyle(node).opacity) || 1
  }
  return opacity
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
    lostAt: null,
    onLanded,
  }
}

// The copy's rectangle between where it started and where it is heading, at the progress of each spring.
function between(from: Rect, to: Rect, px: number, py: number, ps: number): Rect {
  return {
    left: from.left + (to.left - from.left) * px,
    top: from.top + (to.top - from.top) * py,
    width: from.width + (to.width - from.width) * ps,
    height: from.height + (to.height - from.height) * ps,
  }
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

// Flies a flight's copy frame by frame: springs toward the landing, and paints it through `paint`. It ends once it has
// landed, or after waiting too long for a bubble to land on.
function run(
  f: Flight,
  from: Rect,
  paint: (p: { px: number; py: number; ps: number; to: Rect; elapsed: number }) => void
) {
  flights.add(f)
  const sy = spring(224, 24.5)
  const sx = spring(158, 22.6)
  const ss = spring(247, 31.4)
  const t0 = performance.now()
  let last = t0
  let raf = 0
  // Slow motion for checking the flight by eye (set window.__flightSlow = 8 in the console).
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
        f.moving = true
        f.to = rectOf(landing)
      }
    } else if (f.lostAt === null) {
      f.lostAt = now
    }
    const waiting = f.kind === "picture" && !f.moving
    if (waiting ? now - t0 > PICTURE_WAIT : !landing && f.lostAt !== null && now - f.lostAt > ORPHAN_WAIT) return end()

    const p = f.moving ? { px: sx.step(dt), py: sy.step(dt), ps: ss.step(dt) } : { px: 0, py: 0, ps: 0 }
    paint({ ...p, to: f.to, elapsed: (now - t0) / slow })
    f.ghost.style.opacity = landing ? String(effectiveOpacity(landing)) : "1"
    if (f.moving && landing && sy.done && sx.done && ss.done) return end()
    raf = requestAnimationFrame(frame)
  }
  paint({ px: 0, py: 0, ps: 0, to: f.to, elapsed: 0 })
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

  // The words: a second copy in the box's colours sits on top and fades as the bubble's colour comes in, so the words seem
  // to turn into the bubble as they lift. The copy is placed so its first line sits where the box's first line was.
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

  const ghost = makeGhost(from)
  const look = copyOf(bubble, start.width)
  look.style.opacity = "0"
  ghost.appendChild(look)
  let field: HTMLElement | null = null
  if (words) {
    field = copyOf(bubble, start.width)
    field.classList.add("flight-field")
    ghost.appendChild(field)
  }

  bubble.style.visibility = "hidden"
  document.body.appendChild(ghost)
  const f = newFlight(chatId, "text", ghost, from, onLanded)
  f.target = bubble
  f.hidden = bubble

  run(f, from, ({ px, py, ps, to, elapsed }) => {
    const r = between(from, to, px, py, ps)
    ghost.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`
    ghost.style.width = `${r.width}px`
    ghost.style.height = `${r.height}px`
    look.style.width = `${r.width}px`
    look.style.height = `${r.height}px`
    const fade = easeOut(clamp01(elapsed / 170))
    if (field) {
      // The colour change is quick, so the bubble is itself almost as soon as it leaves.
      field.style.width = `${r.width}px`
      field.style.height = `${r.height}px`
      field.style.opacity = String(1 - fade)
    }
    look.style.opacity = String(fade)
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

  const f = newFlight(chatId, "picture", ghost, from)
  run(f, from, ({ px, py, ps, to }) => {
    const r = between(from, to, px, py, ps)
    ghost.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`
    ghost.style.width = `${r.width}px`
    ghost.style.height = `${r.height}px`
    // The bubble's own padding and corner come in as it grows, so the picture settles inside the bubble's frame.
    ghost.style.padding = `${f.pad.y * ps}px ${f.pad.x * ps}px`
    ghost.style.borderRadius = `${CORNER + (f.radius - CORNER) * ps}px`
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
