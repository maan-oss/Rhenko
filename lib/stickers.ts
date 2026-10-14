// Stickers for photos: small emoji and short text placed over a picture, the way TikTok lets people decorate a video.
//
// A sticker's position is a fraction of the whole photo, from 0 to 1 on each side, so it lands on the same part of the
// picture wherever the picture is shown. The layer that draws stickers matches the crop the picture is shown with.
//
// The emoji artwork is Twemoji: graphics under CC-BY 4.0, copyright Twitter, Inc. and other contributors. The files ship in
// public/stickers/twemoji, and the credit is shown in the sticker tray. This file has no imports: the composer, the feed and
// the server all use it.

export const EMOJI_STICKERS: readonly { code: string; name: string }[] = [
  { code: "1f600", name: "Grinning face" },
  { code: "1f602", name: "Face with tears of joy" },
  { code: "1f60d", name: "Smiling face with heart-eyes" },
  { code: "1f929", name: "Star-struck" },
  { code: "1f973", name: "Partying face" },
  { code: "1f60e", name: "Smiling face with sunglasses" },
  { code: "1f970", name: "Smiling face with hearts" },
  { code: "1f62d", name: "Loudly crying face" },
  { code: "1f440", name: "Eyes" },
  { code: "1f47b", name: "Ghost" },
  { code: "1f480", name: "Skull" },
  { code: "1f97a", name: "Pleading face" },
  { code: "1f92f", name: "Exploding head" },
  { code: "1f914", name: "Thinking face" },
  { code: "1f44d", name: "Thumbs up" },
  { code: "1f44f", name: "Clapping hands" },
  { code: "1f64c", name: "Raising hands" },
  { code: "1f64f", name: "Folded hands" },
  { code: "270c", name: "Victory hand" },
  { code: "1f4aa", name: "Flexed biceps" },
  { code: "2764", name: "Red heart" },
  { code: "1f49c", name: "Purple heart" },
  { code: "1f496", name: "Sparkling heart" },
  { code: "1f499", name: "Blue heart" },
  { code: "2728", name: "Sparkles" },
  { code: "1f31f", name: "Glowing star" },
  { code: "2b50", name: "Star" },
  { code: "1f4af", name: "Hundred points" },
  { code: "1f525", name: "Fire" },
  { code: "1f4a5", name: "Collision" },
  { code: "1f4a1", name: "Light bulb" },
  { code: "1f4ac", name: "Speech balloon" },
  { code: "1f389", name: "Party popper" },
  { code: "1f38a", name: "Confetti ball" },
  { code: "1f381", name: "Wrapped gift" },
  { code: "1f388", name: "Balloon" },
  { code: "1f3c6", name: "Trophy" },
  { code: "1f947", name: "First place medal" },
  { code: "1f680", name: "Rocket" },
  { code: "1f308", name: "Rainbow" },
  { code: "2600", name: "Sun" },
  { code: "1f319", name: "Crescent moon" },
  { code: "1f30d", name: "Globe showing Europe-Africa" },
  { code: "1f334", name: "Palm tree" },
  { code: "1f33a", name: "Hibiscus" },
  { code: "1f338", name: "Cherry blossom" },
  { code: "1f340", name: "Four leaf clover" },
  { code: "1f98b", name: "Butterfly" },
  { code: "1f984", name: "Unicorn" },
  { code: "1f431", name: "Cat face" },
  { code: "1f436", name: "Dog face" },
  { code: "1f43c", name: "Panda" },
  { code: "1f427", name: "Penguin" },
  { code: "1f355", name: "Pizza" },
  { code: "1f370", name: "Shortcake" },
  { code: "1f353", name: "Strawberry" },
  { code: "2615", name: "Hot beverage" },
  { code: "1f9c1", name: "Cupcake" },
  { code: "1f3b5", name: "Musical note" },
  { code: "1f3a7", name: "Headphones" },
  { code: "1f4f8", name: "Camera with flash" },
  { code: "1f3ac", name: "Clapper board" },
  { code: "1f3af", name: "Direct hit" },
  { code: "2705", name: "Check mark button" },
  { code: "274c", name: "Cross mark" },
]

export const TEXT_STICKER_STYLES = ["light", "dark", "dusk"] as const
export type TextStickerStyle = (typeof TEXT_STICKER_STYLES)[number]

export type Placement = { x: number; y: number; size: number; rotate: number }
export type EmojiSticker = Placement & { kind: "emoji"; code: string }
export type TextSticker = Placement & { kind: "text"; text: string; style: TextStickerStyle }
export type Sticker = EmojiSticker | TextSticker
export type StickerSet = { aspect: number; items: Sticker[] }

export const MAX_STICKERS = 12
export const MAX_STICKER_TEXT = 40
// A sticker's width, as a share of the photo's width.
export const SIZE_MIN = 0.05
export const SIZE_MAX = 0.6
export const ROTATE_LIMIT = 180
export const ASPECT_MIN = 0.1
export const ASPECT_MAX = 10

const EMOJI_CODES: ReadonlySet<string> = new Set(EMOJI_STICKERS.map((sticker) => sticker.code))

export function emojiFile(code: string): string {
  return `/stickers/twemoji/${code}.svg`
}

export function emojiName(code: string): string {
  return EMOJI_STICKERS.find((sticker) => sticker.code === code)?.name ?? "Sticker"
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

// The shared part of a sticker: where it sits, how big, and how far it is turned. Out-of-range values are brought into
// range rather than refused, so a drag that goes a little past the edge still posts.
export function clampPlacement(raw: Record<string, unknown>): Placement | null {
  const x = finite(raw.x)
  const y = finite(raw.y)
  const size = finite(raw.size)
  const rotate = finite(raw.rotate)
  if (x === null || y === null || size === null || rotate === null) return null
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    size: clamp(size, SIZE_MIN, SIZE_MAX),
    rotate: clamp(rotate, -ROTATE_LIMIT, ROTATE_LIMIT),
  }
}

function parseSticker(raw: unknown): Sticker | null {
  if (!isRecord(raw)) return null
  const place = clampPlacement(raw)
  if (place === null) return null
  if (raw.kind === "emoji") {
    if (typeof raw.code !== "string" || !EMOJI_CODES.has(raw.code)) return null
    return { kind: "emoji", code: raw.code, ...place }
  }
  if (raw.kind === "text") {
    const text = typeof raw.text === "string" ? raw.text.trim().replace(/\s+/g, " ") : ""
    if (text === "" || [...text].length > MAX_STICKER_TEXT) return null
    const style = (TEXT_STICKER_STYLES as readonly string[]).includes(raw.style as string)
      ? (raw.style as TextStickerStyle)
      : null
    if (style === null) return null
    return { kind: "text", text, style, ...place }
  }
  return null
}

// Checks a sticker set sent with a photo. The set is a JSON text, or an object already parsed. Anything that is not a
// valid set is refused with null, which means the photo has no stickers.
export function parseStickerSet(raw: unknown): StickerSet | null {
  let value: unknown = raw
  if (typeof raw === "string") {
    if (raw.trim() === "") return null
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!isRecord(value)) return null
  const aspect = finite(value.aspect)
  if (aspect === null || aspect < ASPECT_MIN || aspect > ASPECT_MAX) return null
  if (!Array.isArray(value.items) || value.items.length === 0 || value.items.length > MAX_STICKERS) return null
  const items: Sticker[] = []
  for (const item of value.items) {
    const sticker = parseSticker(item)
    if (sticker === null) return null
    items.push(sticker)
  }
  return { aspect, items }
}

// The text kept in the database, and sent back to the feed. Parsing it again gives the same set.
export function stickerSetJson(set: StickerSet): string {
  return JSON.stringify(set)
}
