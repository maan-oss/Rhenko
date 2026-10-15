// Stickers for photos: emoji, short text and hashtags placed over a picture, the way TikTok lets people decorate a video.
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

// The look of a text sticker: its font, its colour and its background. A solid sticker is filled with its colour, and its
// text is black or white, whichever reads on that fill. An outline sticker is text in its colour with an edge in the
// opposite colour. A plain sticker is text in its colour on the photo, with a shadow.
export const TEXT_FONTS = ["sans", "serif", "mono"] as const
export const TEXT_COLORS = ["white", "black", "yellow"] as const
export const TEXT_BACKGROUNDS = ["solid", "outline", "none"] as const
export type TextFont = (typeof TEXT_FONTS)[number]
export type TextColor = (typeof TEXT_COLORS)[number]
export type TextBackground = (typeof TEXT_BACKGROUNDS)[number]

// The three looks the tray offers as presets. A sticker saved before fonts, colours and backgrounds existed carries one of
// these names in its style field, and is read as the look it was drawn with.
export const TEXT_LOOKS = ["light", "dark"] as const
export type TextLook = (typeof TEXT_LOOKS)[number]
export const TEXT_LOOK_FIELDS: Record<TextLook, { font: TextFont; color: TextColor; background: TextBackground }> = {
  light: { font: "sans", color: "white", background: "solid" }, // black text on a white box
  dark: { font: "sans", color: "black", background: "solid" }, // white text on a black box
}

// Dusk was a blue text colour and look that has been removed. A sticker saved with it reads as the nearest neutral one.
const RETIRED_COLOR = "dusk"
const RETIRED_LOOK = "dusk"

export type Placement = { x: number; y: number; size: number; rotate: number }
export type EmojiSticker = Placement & { kind: "emoji"; code: string }
export type TextSticker = Placement & {
  kind: "text"
  text: string
  font: TextFont
  color: TextColor
  background: TextBackground
}
// A hashtag is written the way it is in a post: letters, digits and underscores. It links to the topic.
export type HashtagSticker = Placement & { kind: "hashtag"; tag: string }
export type Sticker = EmojiSticker | TextSticker | HashtagSticker
export type StickerSet = { aspect: number; items: Sticker[] }

export const MAX_STICKERS = 12
export const MAX_STICKER_TEXT = 40
export const MAX_HASHTAG = 50
const HASHTAG_PATTERN = /^[\p{L}\p{N}_]{1,50}$/u
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

// Text as it is kept: the ends trimmed and each run of spaces made one space.
export function tidyText(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

// A hashtag as it is typed: spaces at the ends and any leading # taken away.
export function tidyTag(value: string): string {
  return value.trim().replace(/^#+/, "")
}

export function isHashtag(tag: string): boolean {
  return HASHTAG_PATTERN.test(tag)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function oneOf<T extends string>(options: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : null
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

// The font, colour and background of a text sticker. A sticker saved with only a look name is read as that look. A sticker
// that names any of the three must name all of them, each one from its list.
function textLook(raw: Record<string, unknown>): Pick<TextSticker, "font" | "color" | "background"> | null {
  if (raw.font === undefined && raw.color === undefined && raw.background === undefined) {
    if (raw.style === RETIRED_LOOK) return { ...TEXT_LOOK_FIELDS.dark }
    const look = oneOf(TEXT_LOOKS, raw.style)
    return look === null ? null : { ...TEXT_LOOK_FIELDS[look] }
  }
  const font = oneOf(TEXT_FONTS, raw.font)
  const color = raw.color === RETIRED_COLOR ? "black" : oneOf(TEXT_COLORS, raw.color)
  const background = oneOf(TEXT_BACKGROUNDS, raw.background)
  if (font === null || color === null || background === null) return null
  return { font, color, background }
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
    const text = typeof raw.text === "string" ? tidyText(raw.text) : ""
    if (text === "" || [...text].length > MAX_STICKER_TEXT) return null
    const look = textLook(raw)
    if (look === null) return null
    return { kind: "text", text, ...look, ...place }
  }
  if (raw.kind === "hashtag") {
    if (typeof raw.tag !== "string" || !isHashtag(raw.tag)) return null
    return { kind: "hashtag", tag: raw.tag, ...place }
  }
  return null
}

// Checks a sticker set sent with a photo. The set is a JSON text, or an object already parsed. Anything that is not a
// valid set is refused with null, which means the photo has no stickers. The set returned is the one that is kept: text
// is tidied, and a sticker saved in the old style is written in the current one.
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
