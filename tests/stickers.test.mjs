// Unit checks for photo stickers in lib/stickers.ts: the set the server accepts, the ranges it brings values into, and the
// catalogue of emoji, which must match the artwork shipped in public/stickers/twemoji. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import {
  EMOJI_STICKERS,
  MAX_STICKERS,
  MAX_STICKER_TEXT,
  SIZE_MAX,
  SIZE_MIN,
  emojiFile,
  emojiName,
  parseStickerSet,
  stickerSetJson,
} from "../lib/stickers.ts"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function set(items, aspect = 1.5) {
  return { aspect, items }
}

const emoji = (over = {}) => ({ kind: "emoji", code: "1f600", x: 0.5, y: 0.5, size: 0.2, rotate: 0, ...over })
const text = (over = {}) => ({ kind: "text", text: "hello", style: "dusk", x: 0.5, y: 0.5, size: 0.2, rotate: 0, ...over })

test("every emoji in the catalogue has its artwork in public/stickers/twemoji", () => {
  const codes = EMOJI_STICKERS.map((sticker) => sticker.code)
  assert.equal(new Set(codes).size, codes.length, "a code is listed twice")
  for (const sticker of EMOJI_STICKERS) {
    assert.match(sticker.code, /^[0-9a-f]{4,5}$/)
    assert.ok(sticker.name.length > 0)
    const file = path.join(ROOT, "public", emojiFile(sticker.code))
    assert.ok(existsSync(file), `no artwork for ${sticker.code} (${sticker.name})`)
  }
})

test("an emoji sticker outside the catalogue is refused", () => {
  assert.equal(parseStickerSet(set([emoji({ code: "1f4a9-not-listed" })])), null)
  assert.equal(parseStickerSet(set([emoji({ code: "../../etc/passwd" })])), null)
  assert.equal(emojiName("0000"), "Sticker")
})

test("a valid set is accepted, and a JSON text is read the same as an object", () => {
  const value = set([emoji(), text()])
  const fromObject = parseStickerSet(value)
  const fromText = parseStickerSet(JSON.stringify(value))
  assert.deepEqual(fromObject, value)
  assert.deepEqual(fromText, value)
})

test("the set's aspect ratio is checked, since a photo's shape decides where its stickers sit", () => {
  assert.equal(parseStickerSet(set([emoji()], 0)), null)
  assert.equal(parseStickerSet(set([emoji()], 11)), null)
  assert.equal(parseStickerSet(set([emoji()], Number.NaN)), null)
  assert.ok(parseStickerSet(set([emoji()], 0.1)))
  assert.ok(parseStickerSet(set([emoji()], 10)))
})

test("the number of stickers on a photo is limited", () => {
  const items = Array.from({ length: MAX_STICKERS }, () => emoji())
  assert.ok(parseStickerSet(set(items)))
  assert.equal(parseStickerSet(set([...items, emoji()])), null)
  assert.equal(parseStickerSet(set([])), null)
})

test("positions are clamped to the photo, and size and turn are clamped to their ranges", () => {
  const [sticker] = parseStickerSet(set([emoji({ x: -3, y: 9, size: 5, rotate: 400 })])).items
  assert.equal(sticker.x, 0)
  assert.equal(sticker.y, 1)
  assert.equal(sticker.size, SIZE_MAX)
  assert.equal(sticker.rotate, 180)
  const [small] = parseStickerSet(set([emoji({ size: 0.001, rotate: -400 })])).items
  assert.equal(small.size, SIZE_MIN)
  assert.equal(small.rotate, -180)
})

test("a sticker with a position, size or turn that isn't a number is refused", () => {
  assert.equal(parseStickerSet(set([emoji({ x: "0.5" })])), null)
  assert.equal(parseStickerSet(set([emoji({ y: Number.POSITIVE_INFINITY })])), null)
  assert.equal(parseStickerSet(set([emoji({ rotate: null })])), null)
})

test("text stickers keep their words, with spaces tidied, up to the length limit", () => {
  const [sticker] = parseStickerSet(set([text({ text: "  big   news  " })])).items
  assert.equal(sticker.text, "big news")
  assert.equal(parseStickerSet(set([text({ text: "   " })])), null)
  assert.equal(parseStickerSet(set([text({ text: "x".repeat(MAX_STICKER_TEXT + 1) })])), null)
  assert.ok(parseStickerSet(set([text({ text: "x".repeat(MAX_STICKER_TEXT) })])))
})

test("a text sticker must name one of the styles", () => {
  assert.ok(parseStickerSet(set([text({ style: "light" })])))
  assert.equal(parseStickerSet(set([text({ style: "neon" })])), null)
})

test("the kind of a sticker must be emoji or text", () => {
  assert.equal(parseStickerSet(set([{ ...emoji(), kind: "gif" }])), null)
  assert.equal(parseStickerSet(set([{ kind: "script", x: 0, y: 0, size: 0.2, rotate: 0 }])), null)
})

test("malformed input is refused rather than thrown", () => {
  assert.equal(parseStickerSet("{not json"), null)
  assert.equal(parseStickerSet(""), null)
  assert.equal(parseStickerSet(null), null)
  assert.equal(parseStickerSet(42), null)
  assert.equal(parseStickerSet([]), null)
  assert.equal(parseStickerSet({ aspect: 1, items: "many" }), null)
})

test("a set written to the database reads back to the same set", () => {
  const value = parseStickerSet(set([emoji({ x: 0.25 }), text({ text: "hi" })]))
  assert.deepEqual(parseStickerSet(stickerSetJson(value)), value)
})
