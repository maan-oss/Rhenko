// A message you send leaves the place you sent it from and flies into the chat. The words lift out of the message box and
// turn into the bubble on the way; a photo or video leaves its preview. Ported from Parley's lib/send-flight.ts.
//
// The composer arms a flight just before it sends: armText for words in the box, armNext for a photo or video. When the
// new bubble mounts, it takes the flight (launch). A copy of the bubble flies from the origin to wherever the real bubble
// is on each frame, and the real one stays hidden until the copy lands. With reduced motion, nothing flies.

type Rect = { left: number; top: number; width: number; height: number }

export type FlightOrigin =
  // The words in the box: where their first line starts, and the box's text size and line height.
  | { kind: "text"; x: number; y: number; fontSize: number; lineHeight: number }
  // A photo or video: the rectangle it leaves from, and whether it already looks like what lands.
  | { kind: "rect"; rect: Rect; solid: boolean }

interface Armed {
  origin: FlightOrigin
  at: number
}

// A flight not taken this soon after it was armed is dropped (the send did not make a bubble here). A photo or video
// waits for the upload to reach the server, so it gets longer than the words, which arrive at once.
const TTL = 6000
const byId = new Map<string, Armed>()
const byChat = new Map<string, Armed[]>()

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
  const fontSize = parseFloat(cs.fontSize) || 15
  const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.5
  const rtl = cs.direction === "rtl"
  const x = rtl ? r.right - parseFloat(cs.paddingRight) : r.left + parseFloat(cs.paddingLeft)
  const y = r.top + parseFloat(cs.paddingTop) - ta.scrollTop + lineHeight / 2
  return { kind: "text", x, y, fontSize, lineHeight }
}

// A photo or video's origin: the visible preview marked as the thing being sent (data-flight-source).
export function placeOrigin(): FlightOrigin | null {
  if (motionOff()) return null
  const sources = [...document.querySelectorAll<HTMLElement>("[data-flight-source]")].filter(visible)
  if (sources.length === 0) return null
  const big = sources.reduce((a, b) => (area(rectOf(a)) >= area(rectOf(b)) ? a : b))
  return { kind: "rect", rect: rectOf(big), solid: big.getAttribute("data-flight-source") === "solid" }
}

export function armText(id: string, origin: FlightOrigin | null) {
  if (origin) byId.set(id, { origin, at: Date.now() })
}

// The next message of yours that appears in this chat leaves from here.
export function armNext(chatId: string, origin: FlightOrigin | null) {
  if (!origin) return
  const list = (byChat.get(chatId) ?? []).filter((a) => Date.now() - a.at < TTL)
  list.push({ origin, at: Date.now() })
  byChat.set(chatId, list)
}

// Whether a flight waits for this message. Asked while it first draws, so the bubble can start hidden.
export function hasFlight(id: string, chatId: string): boolean {
  if (motionOff()) return false
  const own = byId.get(id)
  if (own && Date.now() - own.at < TTL) return true
  return (byChat.get(chatId) ?? []).some((a) => Date.now() - a.at < TTL)
}

function take(id: string, chatId: string): FlightOrigin | null {
  const own = byId.get(id)
  byId.delete(id)
  if (own && Date.now() - own.at < TTL) return own.origin
  const list = (byChat.get(chatId) ?? []).filter((a) => Date.now() - a.at < TTL)
  const next = list.shift()
  byChat.set(chatId, list)
  return next?.origin ?? null
}

// One spring, integrated in small steps so it is steady at any frame rate. Critically damped springs settle without a
// bounce; these sit a little under that, so the bubble lands with the faintest give.
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

// A copy of the bubble as it looks: no ids or test hooks, inert, at the bubble's own width.
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

// Starts the flight for a bubble that has just mounted, if one was armed for it. Returns whether it flies. `onLanded`
// runs when the copy has landed and the real bubble shows.
export function launch(bubble: HTMLElement, id: string, chatId: string, onLanded?: () => void): boolean {
  if (motionOff()) return false
  const origin = take(id, chatId)
  if (!origin) return false
  const start = bubble.getBoundingClientRect()
  if (!start.width || !start.height) return false

  const ghost = document.createElement("div")
  ghost.setAttribute("aria-hidden", "true")
  ghost.setAttribute("data-flight", "")
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: `${start.width}px`,
    height: `${start.height}px`,
    pointerEvents: "none",
    zIndex: "45",
    transformOrigin: "0 0",
    willChange: "transform",
  })
  const look = copyOf(bubble, start.width)
  ghost.appendChild(look)

  // Words: a second copy in the box's colours sits on top and fades as the bubble's colour comes in, so the words seem to
  // turn into the bubble as they lift. The copy is placed so its first line sits where the box's first line was.
  let field: HTMLElement | null = null
  let scale0 = 1
  let x0 = 0
  let y0 = 0
  const words = origin.kind === "text" ? bubble.querySelector<HTMLElement>("[data-flight-text]") : null
  if (origin.kind === "text" && words) {
    field = copyOf(bubble, start.width)
    field.classList.add("flight-field")
    ghost.appendChild(field)
    const w = words.getBoundingClientRect()
    const wordStyle = getComputedStyle(words)
    const fontSize = parseFloat(wordStyle.fontSize) || origin.fontSize
    const lineHeight = parseFloat(wordStyle.lineHeight) || fontSize * 1.5
    scale0 = origin.fontSize / fontSize
    const offX = w.left - start.left
    const offY = w.top - start.top + lineHeight / 2
    x0 = origin.x - offX * scale0
    y0 = origin.y - offY * scale0
    look.style.opacity = "0"
  } else if (origin.kind === "text") {
    scale0 = 1
    x0 = origin.x
    y0 = origin.y - origin.lineHeight / 2
    look.style.opacity = "0"
  } else {
    // From the middle of the preview, at its size (kept within a sensible range of the bubble's).
    const o = origin.rect
    scale0 = Math.max(0.3, Math.min(2.2, o.width / start.width))
    x0 = o.left + o.width / 2 - (start.width * scale0) / 2
    y0 = o.top + o.height / 2 - (start.height * scale0) / 2
    if (!origin.solid) look.style.opacity = "0"
  }

  bubble.style.visibility = "hidden"
  document.body.appendChild(ghost)

  // Up is a touch quicker than across, so the bubble rises out of the box and sweeps into its place, landing with the
  // faintest give. Size settles on its own spring with no bounce.
  const sy = spring(224, 24.5)
  const sx = spring(158, 22.6)
  const ss = spring(247, 31.4)
  const t0 = performance.now()
  let last = t0
  let raf = 0

  const finish = () => {
    cancelAnimationFrame(raf)
    bubble.style.visibility = ""
    ghost.remove()
    onLanded?.()
  }

  // Slow motion for checking the flight by eye (set window.__flightSlow = 8 in the console).
  const slow = Math.max(1, Number((window as unknown as { __flightSlow?: number }).__flightSlow) || 1)
  const frame = (now: number) => {
    if (!bubble.isConnected) return finish()
    const dt = Math.min(0.034, (now - last) / 1000) / slow
    last = now
    const py = sy.step(dt)
    const px = sx.step(dt)
    const ps = ss.step(dt)
    const d = bubble.getBoundingClientRect()
    const x = x0 + (d.left - x0) * px
    const y = y0 + (d.top - y0) * py
    const s = scale0 + (1 - scale0) * ps
    ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`
    if (field) {
      // The colour change is quick, so the bubble is itself almost as soon as it leaves.
      const fade = easeOut(clamp01((now - t0) / slow / 170))
      field.style.opacity = String(1 - fade)
      look.style.opacity = String(fade)
    } else if (look.style.opacity !== "1") {
      look.style.opacity = String(easeOut(clamp01((now - t0) / slow / 170)))
    }
    // Lands at the strength the bubble itself has.
    ghost.style.opacity = String(effectiveOpacity(bubble))
    if ((sy.done && sx.done && ss.done) || (now - t0) / slow > 1400) return finish()
    raf = requestAnimationFrame(frame)
  }
  // Placed at the origin before the first paint, so the copy never shows at the bubble's own place first.
  ghost.style.transform = `translate3d(${x0}px, ${y0}px, 0) scale(${scale0})`
  raf = requestAnimationFrame(frame)
  return true
}
