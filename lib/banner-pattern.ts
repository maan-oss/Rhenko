// The banner a profile shows until its owner adds a photo. It is drawn from the account's handle, so each profile has its
// own pattern: a few contour lines that wander across a wide box. Pure and deterministic, so the page always draws the
// same banner for the same handle.

export type BannerLine = { d: string; opacity: number }

// The drawing box. Every line is a path inside it, and the banner scales it to fit.
export const BANNER_WIDTH = 1200
export const BANNER_HEIGHT = 300

// FNV-1a: a small, fast hash of the handle, used as the seed.
function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

// mulberry32: a seeded random number generator, returning values from 0 up to 1.
function generator(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

// A smooth path through the points: each point is a control point, and the curve passes through the midpoints between them.
function smoothPath(points: [number, number][]): string {
  const first = points[0]
  let d = `M${first[0]} ${first[1].toFixed(1)}`
  for (let index = 1; index < points.length - 1; index++) {
    const [x, y] = points[index]
    const [nextX, nextY] = points[index + 1]
    d += ` Q${x} ${y.toFixed(1)} ${((x + nextX) / 2).toFixed(1)} ${((y + nextY) / 2).toFixed(1)}`
  }
  const last = points[points.length - 1]
  d += ` L${last[0]} ${last[1].toFixed(1)}`
  return d
}

// Between seven and eleven lines, spread from above the top edge to below the bottom edge. Their waves differ, so no two
// handles get the same drawing.
export function bannerLines(handle: string): BannerLine[] {
  const random = generator(hash(handle.toLowerCase()))
  const count = 7 + Math.floor(random() * 5)
  const tilt = (random() - 0.5) * 0.35
  const lines: BannerLine[] = []
  for (let index = 0; index < count; index++) {
    const spread = index / (count - 1)
    const base = BANNER_HEIGHT * (-0.1 + spread * 1.2) + tilt * BANNER_HEIGHT * (spread - 0.5)
    const amplitude = 34 + random() * 60
    const frequency = 0.9 + random() * 1.5
    const phase = random() * Math.PI * 2
    const secondary = 0.2 + random() * 0.25
    const points: [number, number][] = []
    for (let x = -24; x <= BANNER_WIDTH + 24; x += 24) {
      const t = x / BANNER_WIDTH
      const y =
        base +
        Math.sin(t * Math.PI * 2 * frequency + phase) * amplitude +
        Math.sin(t * Math.PI * 2 * frequency * 2.7 + phase * 1.9) * amplitude * secondary
      points.push([x, y])
    }
    lines.push({ d: smoothPath(points), opacity: 0.3 + random() * 0.32 })
  }
  return lines
}
