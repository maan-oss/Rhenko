"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

// The sign-in art is liquid chrome, shown on desktop only. A medallion sits at the centre with the Rhenko mark cut out
// of it, so the mark stays crisp and shows the panel's colour.
//
// The medallion is one signed-distance field. The coin, the bead that follows the pointer and each droplet are joined
// with a smooth union, so a droplet leaves through a neck that stretches as it pulls away and merges back the same way.
// A droplet swells on the surface, budges off, flies out under drag and gravity, is pulled back by a damped spring and
// sinks in, and the coin takes a small ripple. A horizon and a point light sweep up and down over the whole medallion,
// so the chrome's bright band and its glint travel across the body. The field, the chrome and the cut-out are one
// fragment shader and one draw call, and the CPU only moves a dozen points a frame.
//
// Colours come from the theme tokens. The static medallion beneath the canvas shows until WebGL 2 is running. The loop
// stops while the art is off screen or the tab is hidden, and under reduced motion the canvas draws one still frame.

const VIEW_W = 600
const VIEW_H = 800
const CENTER = { x: 300, y: 400 }
const COIN_R = 150
const LOGO = { x: 200, y: 310, size: 200 }
// The Rhenko R, the same path as components/brand/symbol.tsx. It is 510 by 457 units.
const MARK_UNITS = 510
const MARK =
  "M375.7 455.8C358.3 454.2 342 447.3 330.2 436.5C324.1 430.9 304 408.4 268.5 367.1C247.9 343.2 246 340.9 246 339.9C246 339.4 248.4 336.2 251.3 332.8C254.2 329.3 259 323.6 262 320C287.2 290.1 300.6 274.6 305.6 269.6C314.8 260.3 326 253.9 336.7 251.6C340.4 250.8 339.1 249.5 358.5 272C405.6 326.6 426.3 350.9 453.5 383.5C465 397.2 482.4 418 492.2 429.7C509.1 449.8 511.7 453.8 508.8 455.6C507.2 456.6 386.1 456.7 375.7 455.8ZM62.6 454.4C29.1 446.9 7 423.3 7 395.1C7 381.5 10.9 372.2 22.9 356.7C27.1 351.3 40.4 334.2 52.4 318.7C75.5 289.1 92.7 266.9 106.8 248.5C119.9 231.5 137.1 210.2 143.5 203C163.7 180.4 187.6 166.4 215.5 160.9C221.2 159.7 245.2 159.5 348.7 159.5C418.2 159.5 475 159.2 475 158.9C475 158.6 473.5 156.3 471.6 153.8C464.3 144.3 449.6 137.3 428.5 133.2C421.7 131.9 400.2 131.6 281 131C125.9 130.3 137.3 130.8 118.6 123.4C97.8 115 81.6 102.6 62.8 80.5C57.6 74.5 46.4 61.4 37.9 51.4C-2.8 3.7 -1 6 0.8 3.4C3 0 4 0 180.2 0C370.8 0 361.5 -0.2 374.4 5.8C387.9 12.2 399.2 23.2 408.9 39.5C411.6 43.9 427.1 69.8 443.5 97C459.9 124.2 474.7 149.4 476.3 153C484.2 170.1 478.6 190.7 461.2 209.1C453 217.8 441 226 429.5 230.6C412 237.6 419.1 237.2 288.5 238C162 238.7 166 238.6 146.5 243.9C132.7 247.7 110.8 257.8 104.7 263.2C103.3 264.4 104.5 264.1 108.1 262.1C116.6 257.5 136 251.4 149.9 249.1C161.7 247.1 165.9 247 242.4 247L322.5 247L316.5 250.3C301.4 258.4 299.3 260.6 238.3 331.4C173.8 406.1 162.9 418.1 148.5 429.9C135.7 440.4 119.8 448.6 103.5 453C92.8 455.9 72.5 456.6 62.6 454.4Z"

// Droplets, by radius. Each one leaves and returns on its own schedule.
const DROP_RADII = [34, 24, 40, 20, 28, 16, 12, 9]
const DROP_COUNT = DROP_RADII.length
// The shader reads one shape per droplet plus the pointer's bead.
const SHAPES = DROP_COUNT + 1
const HEAD_R = 30
// How far neighbouring shapes pull together before they join: a longer reach gives a longer neck.
const JOIN = 26
// Each phase's length in seconds, and what it does.
const SWELL = 0.7 // the droplet grows on the surface before it leaves
const BUD_T = 0.55 // it moves out of the surface, its neck stretching as it goes
const ABSORB_T = 0.45 // it sinks back in and shrinks to nothing
const RETURN_MAX = 4.5 // a return that has not landed by then is taken to have landed
const GRAVITY = 46 // view units per second squared, pulling droplets down
const DRAG = 0.9 // how quickly flight slows
const SPRING = 11 // pull back to the surface on the return
const DAMP = 4.6 // keeps the return from overshooting

const DOCKED = 0
const BUDDING = 1
const FLYING = 2
const RETURNING = 3
const ABSORBING = 4

type Drop = {
  base: number // resting radius
  phase: number
  t: number // time in the current phase
  wait: number // time docked before it leaves
  angle: number // where on the surface it sits
  boost: number // speed multiplier, so a click throws it harder
  flight: number // length of its flight
  d0: number // distance from the centre when it started to bud
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

type Rgb = [number, number, number]

const FALLBACK_COLORS = {
  top: [0.64, 0.64, 0.64] as Rgb,
  mid: [0.96, 0.96, 0.96] as Rgb,
  line: [1, 1, 1] as Rgb,
  low: [0.08, 0.08, 0.08] as Rgb,
  base: [0.29, 0.29, 0.29] as Rgb,
}

const VERTEX = `#version 300 es
const vec2 CORNERS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  gl_Position = vec4(CORNERS[gl_VertexID], 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uCanvas;
uniform vec2 uOff;
uniform float uScale;
uniform float uTime;
uniform int uCount;
uniform vec4 uSeg[${SHAPES}];
uniform float uRad[${SHAPES}];
uniform vec2 uHead;
uniform float uPull;
uniform float uRippleAge;
uniform vec2 uLight;
uniform float uHorizon;
uniform vec3 uTop;
uniform vec3 uMid;
uniform vec3 uLine;
uniform vec3 uLow;
uniform vec3 uBase;
uniform sampler2D uMark;
out vec4 fragColor;

const vec2 C = vec2(${CENTER.x.toFixed(1)}, ${CENTER.y.toFixed(1)});
const float R0 = ${COIN_R.toFixed(1)};
const vec2 LOGO_XY = vec2(${LOGO.x.toFixed(1)}, ${LOGO.y.toFixed(1)});
const float LOGO_SIZE = ${LOGO.size.toFixed(1)};
const float JOIN = ${JOIN.toFixed(1)};

// The medallion's radius at this point's angle: a slow wobble, a swell toward the pointer and a ripple after a drop lands.
float coinRadius(vec2 p) {
  float th = atan(p.y - C.y, p.x - C.x);
  float r = R0 + 5.0 * sin(3.0 * th + uTime * 0.9) + 3.5 * sin(5.0 * th - uTime * 1.1);
  float ang = atan(uHead.y - C.y, uHead.x - C.x);
  float reach = uPull / (1.0 + length(uHead - C) / 260.0);
  r += 34.0 * reach * pow(max(0.0, cos(th - ang)), 6.0);
  float age = min(uRippleAge, 10.0);
  r += 10.0 * exp(-age * 2.2) * sin(4.0 * th - age * 12.0);
  return r;
}

float smoothJoin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Distance to a capsule (a segment with a radius). q is the point's offset from the spine, in radii.
float capsule(vec2 p, vec4 seg, float r, out vec2 q) {
  vec2 a = seg.xy;
  vec2 ba = seg.zw - a;
  float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  vec2 c = a + ba * h;
  q = (p - c) / r;
  return length(p - c) - r;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 p = (px - uOff) / uScale;

  // The coin, then each shape joined to it. The shape nearest the surface sets the normal used for shading.
  vec2 cq = p - C;
  float R = coinRadius(p);
  float d = length(cq) - R;
  float bestD = d;
  vec2 bestQ = cq / R;
  for (int i = 0; i < ${SHAPES}; i++) {
    if (i >= uCount) break;
    float r = uRad[i];
    if (r <= 0.0) continue;
    vec2 q;
    float dp = capsule(p, uSeg[i], r, q);
    d = smoothJoin(d, dp, JOIN);
    if (dp < bestD) {
      bestD = dp;
      bestQ = q;
    }
  }

  // A dome from the nearest shape gives each surface its own curve, so the glint and the horizon bend over it.
  vec3 n = normalize(vec3(bestQ, sqrt(max(0.04, 1.0 - dot(bestQ, bestQ)))));

  float aa = max(fwidth(d), 0.5);
  float body = 1.0 - smoothstep(-aa, aa, d);

  // The chrome environment: a horizon moves up and down over the body. Just above it the metal is bright, and the sky
  // greys toward the top; just below it the metal goes dark toward the base.
  float e = (uHorizon - p.y) / 70.0 + 0.45 * n.y;
  vec3 col;
  if (e > 0.0) {
    vec3 near = mix(uLine, uMid, smoothstep(0.0, 0.6, e));
    col = mix(near, uTop, smoothstep(0.6, 2.4, e));
  } else {
    vec3 below = mix(uLine, uLow, smoothstep(0.0, 0.7, -e));
    col = mix(below, uBase, 0.7 * smoothstep(1.2, 3.0, -e));
  }

  // The glint: a point light that sweeps over the body, and a soft rim where the surface turns away.
  vec3 lightDir = normalize(vec3(uLight - p, 210.0));
  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, halfVec), 0.0), 120.0);
  float rim = pow(1.0 - n.z, 3.0);
  col += uLine * (spec * 1.15 + rim * 0.16);
  col = min(col, vec3(1.0));

  // The Rhenko mark is cut out of the body, so the panel shows through it.
  vec2 uv = (p - LOGO_XY) / LOGO_SIZE;
  // The texture is clamped at its edges, so outside the mark's box it is masked to nothing rather than smeared.
  vec2 inBox = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  float mark = texture(uMark, uv).r * inBox.x * inBox.y;
  float alpha = body * (1.0 - mark);
  fragColor = vec4(col * alpha, alpha);
}`

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

// The signed gap between two angles, wrapped to (-PI, PI].
function angleGap(a: number, b: number) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// The point a droplet sits at on the medallion's surface, pushed in by a quarter of its radius so it merges.
function surfacePoint(angle: number, r: number) {
  const d = COIN_R - 0.25 * r
  return { x: CENTER.x + Math.cos(angle) * d, y: CENTER.y + Math.sin(angle) * d }
}

// The point itself, or the nearest point inside a circle of radius max around the centre.
function pullInside(x: number, y: number, max: number) {
  const dx = x - CENTER.x
  const dy = y - CENTER.y
  const d = Math.hypot(dx, dy)
  if (d <= max || d === 0) return { x, y }
  return { x: CENTER.x + (dx / d) * max, y: CENTER.y + (dy / d) * max }
}

// Reads '#rrggbb' or '#rgb' into 0 to 1 channels, or returns null for anything else.
function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace(/^#/, "")
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [parseInt(full.slice(0, 2), 16) / 255, parseInt(full.slice(2, 4), 16) / 255, parseInt(full.slice(4, 6), 16) / 255]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("no shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(log ?? "shader failed")
  }
  return shader
}

function linkProgram(gl: WebGL2RenderingContext) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!program) throw new Error("no program")
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(log ?? "link failed")
  }
  return program
}

// The mark, drawn once: white inside the R and black elsewhere, in the path's own units. Every mount shares it.
let markSource: HTMLCanvasElement | null = null
function markCanvas() {
  if (markSource) return markSource
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext("2d")
  if (ctx) {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, 512, 512)
    ctx.setTransform(512 / MARK_UNITS, 0, 0, 512 / MARK_UNITS, 0, 0)
    ctx.fillStyle = "#fff"
    ctx.fill(new Path2D(MARK), "evenodd")
  }
  markSource = canvas
  return canvas
}

function markTexture(gl: WebGL2RenderingContext) {
  const texture = gl.createTexture()
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, markCanvas())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

function uniformsOf(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const at = (name: string) => gl.getUniformLocation(program, name)
  return {
    canvas: at("uCanvas"),
    off: at("uOff"),
    scale: at("uScale"),
    time: at("uTime"),
    count: at("uCount"),
    seg: at("uSeg[0]"),
    rad: at("uRad[0]"),
    head: at("uHead"),
    pull: at("uPull"),
    ripple: at("uRippleAge"),
    light: at("uLight"),
    horizon: at("uHorizon"),
    top: at("uTop"),
    mid: at("uMid"),
    line: at("uLine"),
    low: at("uLow"),
    base: at("uBase"),
    mark: at("uMark"),
  }
}

// Runs the medallion on a WebGL 2 canvas. Returns the teardown, or undefined when the shader cannot run, which leaves
// the static medallion on screen.
function start(
  wrap: HTMLDivElement,
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  statics: SVGSVGElement | null,
): (() => void) | undefined {
  let program: WebGLProgram
  try {
    program = linkProgram(gl)
  } catch {
    return undefined
  }
  gl.useProgram(program)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const texture = markTexture(gl)
  const u = uniformsOf(gl, program)
  gl.uniform1i(u.mark, 0)

  // Colours follow the theme. They are read from the tokens, so a theme change repaints the art.
  const colors = { ...FALLBACK_COLORS }
  function readColors() {
    const style = getComputedStyle(document.documentElement)
    const read = (name: string, fallback: Rgb) => parseHex(style.getPropertyValue(name)) ?? fallback
    colors.top = read("--art-top", FALLBACK_COLORS.top)
    colors.mid = read("--art-mid", FALLBACK_COLORS.mid)
    colors.line = read("--art-line", FALLBACK_COLORS.line)
    colors.low = read("--art-low", FALLBACK_COLORS.low)
    colors.base = read("--art-base", FALLBACK_COLORS.base)
  }
  readColors()

  // The canvas is sized to the panel in device pixels, at most 2x, and the view box is cropped to fill it the way the
  // static medallion is. This runs when the panel resizes, not every frame.
  const view = { scale: 1, offX: 0, offY: 0 }
  function fit() {
    const rect = wrap.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    gl.viewport(0, 0, w, h)
    const css = Math.max(rect.width / VIEW_W, rect.height / VIEW_H, 1e-3)
    view.scale = css * dpr
    view.offX = (w - VIEW_W * view.scale) / 2
    view.offY = (h - VIEW_H * view.scale) / 2
  }

  // The bead that follows the pointer, with a trail behind it so a moving pointer leaves a stretched drop.
  const head = { x: CENTER.x, y: CENTER.y - COIN_R + 16, tx: CENTER.x, ty: CENTER.y - COIN_R + 16 }
  const pointer = { inside: false, x: CENTER.x, y: CENTER.y }
  const light = { x: CENTER.x, y: CENTER.y }
  let pull = 0
  let rippleAge = 1e9
  let t = 0

  const drops: Drop[] = DROP_RADII.map((base, index) => {
    const angle = (index / DROP_COUNT) * Math.PI * 2 + rand(-0.3, 0.3)
    const r = base * 0.62
    const at = surfacePoint(angle, r)
    return {
      base,
      phase: DOCKED,
      t: 0,
      wait: rand(0.6, 4.8),
      angle,
      boost: 1,
      flight: 1,
      d0: 0,
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      r,
    }
  })

  function pickAngle() {
    if (pointer.inside && Math.random() < 0.6) {
      return Math.atan2(pointer.y - CENTER.y, pointer.x - CENTER.x) + rand(-0.45, 0.45)
    }
    return rand(0, Math.PI * 2)
  }

  function dock(drop: Drop) {
    drop.phase = DOCKED
    drop.t = 0
    drop.wait = rand(3, 6.5)
    drop.angle = pickAngle()
    drop.boost = 1
    drop.r = drop.base * 0.62
    const at = surfacePoint(drop.angle, drop.r)
    drop.x = at.x
    drop.y = at.y
    drop.vx = 0
    drop.vy = 0
  }

  // Starts a droplet budding from where it sits now, so the move out is continuous.
  function bud(drop: Drop, boost: number) {
    drop.phase = BUDDING
    drop.t = 0
    drop.boost = boost
    drop.d0 = Math.hypot(drop.x - CENTER.x, drop.y - CENTER.y)
  }

  // A click throws the two droplets nearest to it off the surface straight away, and ripples the coin.
  function burst(px: number, py: number) {
    rippleAge = 0
    const angle = Math.atan2(py - CENTER.y, px - CENTER.x)
    drops
      .filter((drop) => drop.phase === DOCKED)
      .sort((a, b) => Math.abs(angleGap(a.angle, angle)) - Math.abs(angleGap(b.angle, angle)))
      .slice(0, 2)
      .forEach((drop) => bud(drop, 1.3))
  }

  function stepDrop(drop: Drop, dt: number) {
    drop.t += dt
    if (drop.phase === DOCKED) {
      // It swells on the surface, then leaves.
      const swell = easeInOut(clamp((drop.t - (drop.wait - SWELL)) / SWELL, 0, 1))
      drop.r = drop.base * (0.62 + 0.38 * swell)
      const at = surfacePoint(drop.angle, drop.r)
      drop.x = at.x
      drop.y = at.y
      if (drop.t >= drop.wait) bud(drop, 1)
    } else if (drop.phase === BUDDING) {
      // It moves out from the surface. The neck to the coin stretches as it goes.
      const k = clamp(drop.t / BUD_T, 0, 1)
      const dist = lerp(drop.d0, COIN_R + 1.15 * drop.base + 14, easeOut(k))
      const dx = Math.cos(drop.angle)
      const dy = Math.sin(drop.angle)
      drop.x = CENTER.x + dx * dist
      drop.y = CENTER.y + dy * dist
      drop.r = lerp(drop.r, drop.base * 0.92, 1 - Math.exp(-dt * 8))
      if (k >= 1) {
        const speed = rand(80, 125) * drop.boost
        const spin = rand(-22, 22)
        drop.vx = dx * speed - dy * spin
        drop.vy = dy * speed + dx * spin
        drop.flight = rand(0.8, 1.25)
        drop.phase = FLYING
        drop.t = 0
      }
    } else if (drop.phase === FLYING) {
      // Drag slows it and gravity bends it down, so it arcs out and shrinks a little as it goes.
      drop.vx -= DRAG * drop.vx * dt
      drop.vy += (GRAVITY - DRAG * drop.vy) * dt
      drop.x += drop.vx * dt
      drop.y += drop.vy * dt
      const k = clamp(drop.t / drop.flight, 0, 1)
      drop.r = lerp(drop.r, drop.base * (0.92 - 0.14 * k), 1 - Math.exp(-dt * 6))
      if (drop.t >= drop.flight) {
        drop.phase = RETURNING
        drop.t = 0
      }
    } else if (drop.phase === RETURNING) {
      // A damped spring draws it back to where it left. It speeds up toward the coin and settles into it.
      const anchor = surfacePoint(drop.angle, drop.base)
      const ax = SPRING * (anchor.x - drop.x) - DAMP * drop.vx
      const ay = SPRING * (anchor.y - drop.y) - DAMP * drop.vy
      drop.vx += ax * dt
      drop.vy += ay * dt
      drop.x += drop.vx * dt
      drop.y += drop.vy * dt
      drop.r = lerp(drop.r, drop.base * 0.84, 1 - Math.exp(-dt * 6))
      const gap = Math.hypot(anchor.x - drop.x, anchor.y - drop.y)
      if (gap < 0.5 * drop.r + 10 || drop.t > RETURN_MAX) {
        drop.phase = ABSORBING
        drop.t = 0
        rippleAge = 0
      }
    } else {
      // It sinks into the coin and shrinks to nothing. The landing sends a ripple across the coin.
      const anchor = surfacePoint(drop.angle, drop.base)
      const k = clamp(drop.t / ABSORB_T, 0, 1)
      const follow = 1 - Math.exp(-dt * 14)
      drop.x = lerp(drop.x, anchor.x, follow)
      drop.y = lerp(drop.y, anchor.y, follow)
      drop.r = drop.base * 0.84 * (1 - easeInOut(k))
      if (k >= 1) dock(drop)
    }
  }

  // One step of the scene: the bead, the light, the droplets and the ripple.
  function step(dt: number) {
    t += dt
    rippleAge += dt
    // The bead follows the pointer across the surface. Away from the art it rolls round the rim, so the coin never looks flat.
    const goal = pointer.inside
      ? pullInside(pointer.x, pointer.y, COIN_R - 14)
      : {
          x: CENTER.x + (COIN_R - 16) * Math.cos(t * 0.3 + 1.1),
          y: CENTER.y + (COIN_R - 16) * Math.sin(t * 0.3 + 1.1),
        }
    head.tx = lerp(head.tx, head.x, 1 - Math.exp(-dt * 1.8))
    head.ty = lerp(head.ty, head.y, 1 - Math.exp(-dt * 1.8))
    const headK = 1 - Math.exp(-dt * 4)
    head.x = lerp(head.x, goal.x, headK)
    head.y = lerp(head.y, goal.y, headK)
    pull = lerp(pull, pointer.inside ? 1 : 0, 1 - Math.exp(-dt * 3))

    for (const drop of drops) stepDrop(drop, dt)

    // The light sweeps up and down over the body, and the pointer draws it toward itself while it is over the art.
    const lightGoal = pointer.inside
      ? { x: pointer.x - 40, y: pointer.y - 70 }
      : { x: CENTER.x - 60 + 42 * Math.sin(t * 0.31), y: CENTER.y + 210 * Math.sin(t * 0.55 + 0.6) }
    const lightK = 1 - Math.exp(-dt * 2.5)
    light.x = lerp(light.x, lightGoal.x, lightK)
    light.y = lerp(light.y, lightGoal.y, lightK)
  }

  // Each shape is a capsule from its trail to its position, so a fast droplet stretches along its path.
  const segs = new Float32Array(SHAPES * 4)
  const rads = new Float32Array(SHAPES)
  function fillShapes() {
    for (let index = 0; index < DROP_COUNT; index++) {
      const drop = drops[index]
      const speed = Math.hypot(drop.vx, drop.vy)
      const moving = drop.phase === FLYING || drop.phase === RETURNING
      const tail = moving ? clamp(speed * 0.055, 0, 26) : 0
      const ux = speed > 1e-3 ? drop.vx / speed : 0
      const uy = speed > 1e-3 ? drop.vy / speed : 0
      segs[index * 4] = drop.x - ux * tail
      segs[index * 4 + 1] = drop.y - uy * tail
      segs[index * 4 + 2] = drop.x
      segs[index * 4 + 3] = drop.y
      rads[index] = drop.r
    }
    const h = DROP_COUNT
    segs[h * 4] = head.tx
    segs[h * 4 + 1] = head.ty
    segs[h * 4 + 2] = head.x
    segs[h * 4 + 3] = head.y
    // The bead only shows while the pointer is over the art; otherwise it sinks back into the coin.
    rads[h] = HEAD_R * pull
  }

  let shown = false
  function render() {
    fillShapes()
    // The horizon sweeps up and down over the whole medallion, so the chrome's bright band travels across it.
    gl.uniform2f(u.canvas, canvas.width, canvas.height)
    gl.uniform2f(u.off, view.offX, view.offY)
    gl.uniform1f(u.scale, view.scale)
    gl.uniform1f(u.time, t)
    gl.uniform1i(u.count, SHAPES)
    gl.uniform4fv(u.seg, segs)
    gl.uniform1fv(u.rad, rads)
    gl.uniform2f(u.head, head.x, head.y)
    gl.uniform1f(u.pull, pull)
    gl.uniform1f(u.ripple, rippleAge)
    gl.uniform2f(u.light, light.x, light.y)
    gl.uniform1f(u.horizon, CENTER.y + 190 * Math.sin(t * 0.55))
    gl.uniform3fv(u.top, colors.top)
    gl.uniform3fv(u.mid, colors.mid)
    gl.uniform3fv(u.line, colors.line)
    gl.uniform3fv(u.low, colors.low)
    gl.uniform3fv(u.base, colors.base)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    if (!shown) {
      shown = true
      canvas.style.opacity = "1"
      if (statics) statics.style.opacity = "0"
    }
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  let visible = true
  let frame = 0
  let last = 0

  function running() {
    return visible && !reduced && !document.hidden
  }

  function tick(now: number) {
    frame = 0
    if (!running()) return
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now
    step(dt)
    render()
    frame = requestAnimationFrame(tick)
  }

  // Starts the loop when the art is on screen and the tab is visible. Nothing runs while it is not.
  function wake() {
    if (!frame && running()) frame = requestAnimationFrame(tick)
  }

  function toView(clientX: number, clientY: number) {
    const rect = wrap.getBoundingClientRect()
    const css = Math.max(rect.width / VIEW_W, rect.height / VIEW_H, 1e-3)
    const ox = (rect.width - VIEW_W * css) / 2
    const oy = (rect.height - VIEW_H * css) / 2
    return {
      x: clamp((clientX - rect.left - ox) / css, 0, VIEW_W),
      y: clamp((clientY - rect.top - oy) / css, 0, VIEW_H),
    }
  }

  function onMove(event: PointerEvent) {
    const point = toView(event.clientX, event.clientY)
    pointer.x = point.x
    pointer.y = point.y
    pointer.inside = true
  }
  function onDown(event: PointerEvent) {
    const point = toView(event.clientX, event.clientY)
    pointer.x = point.x
    pointer.y = point.y
    pointer.inside = true
    burst(point.x, point.y)
  }
  function onLeave() {
    pointer.inside = false
  }

  fit()
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true
    wake()
  })
  observer.observe(wrap)
  const resize = new ResizeObserver(() => {
    fit()
    if (reduced) render()
  })
  resize.observe(wrap)
  const themeObserver = new MutationObserver(() => {
    readColors()
    if (reduced) render()
  })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] })
  document.addEventListener("visibilitychange", wake)

  if (reduced) {
    // A still frame: the medallion at rest, with its glint and horizon where the sweep starts.
    step(0)
    render()
  } else {
    wrap.addEventListener("pointermove", onMove)
    wrap.addEventListener("pointerdown", onDown)
    wrap.addEventListener("pointerleave", onLeave)
    wake()
  }

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    resize.disconnect()
    themeObserver.disconnect()
    document.removeEventListener("visibilitychange", wake)
    wrap.removeEventListener("pointermove", onMove)
    wrap.removeEventListener("pointerdown", onDown)
    wrap.removeEventListener("pointerleave", onLeave)
    gl.deleteProgram(program)
    gl.deleteTexture(texture)
    gl.deleteVertexArray(vao)
  }
}

export function AuthArt({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const staticRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true })
    if (!gl) return
    return start(wrap, canvas, gl, staticRef.current)
  }, [])

  return (
    <div ref={wrapRef} aria-hidden="true" className={cn("absolute inset-0 overflow-hidden", className)}>
      {/* The static medallion: the first paint, and what remains if WebGL 2 is not available. */}
      <svg
        ref={staticRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full transition-opacity duration-500"
      >
        <defs>
          <linearGradient id="auth-art-static" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={CENTER.y - COIN_R} y2={CENTER.y + COIN_R}>
            <stop offset="0" style={{ stopColor: "var(--art-top)" }} />
            <stop offset="0.46" style={{ stopColor: "var(--art-mid)" }} />
            <stop offset="0.5" style={{ stopColor: "var(--art-line)" }} />
            <stop offset="0.56" style={{ stopColor: "var(--art-low)" }} />
            <stop offset="1" style={{ stopColor: "var(--art-base)" }} />
          </linearGradient>
          <mask id="auth-art-static-cut" maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW_W} height={VIEW_H}>
            <rect width={VIEW_W} height={VIEW_H} fill="#fff" />
            <path
              fill="#000"
              fillRule="evenodd"
              d={MARK}
              transform={`translate(${LOGO.x} ${LOGO.y}) scale(${LOGO.size / MARK_UNITS})`}
            />
          </mask>
        </defs>
        <circle cx={CENTER.x} cy={CENTER.y} r={COIN_R} fill="url(#auth-art-static)" mask="url(#auth-art-static-cut)" />
      </svg>
      <canvas ref={canvasRef} className="absolute inset-0 size-full opacity-0 transition-opacity duration-500" />
    </div>
  )
}
