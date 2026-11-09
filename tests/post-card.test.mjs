// Unit checks for the layout of a post's picture (lib/post-card.ts): where lines break, how long words are split, and how text that
// is cut short ends. Each character is 10 wide, so a width of 90 holds nine characters. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import { ellipsize, fitLines, wrapText } from "../lib/post-card.ts"

const measure = (text) => Array.from(text).length * 10

test("words wrap greedily at the width", () => {
  assert.deepEqual(wrapText("one two three four", 90, measure), ["one two", "three", "four"])
})

test("a paragraph break is a line, and an empty paragraph is an empty line", () => {
  assert.deepEqual(wrapText("a\n\nb", 90, measure), ["a", "", "b"])
  assert.deepEqual(wrapText("", 90, measure), [""])
})

test("a word wider than a line is broken at its letters", () => {
  assert.deepEqual(wrapText("abcdefghijkl", 50, measure), ["abcde", "fghij", "kl"])
})

test("lines past the limit are dropped, and the last kept line ends with an ellipsis", () => {
  const lines = ["one", "two", "three", "four", "five"]
  const kept = fitLines(lines, 3, 90, measure)
  assert.equal(kept.length, 3)
  assert.equal(kept[0], "one")
  assert.ok(kept[2].endsWith("…"))
  assert.ok(measure(kept[2]) <= 90)
})

test("text that fits is left alone, and text that does not is cut to fit with an ellipsis", () => {
  assert.equal(ellipsize("short", 90, measure), "short")
  const cut = ellipsize("hello world", 60, measure)
  assert.equal(cut, "hello…")
  assert.ok(measure(cut) <= 60)
})

test("a short list of lines is returned as it is", () => {
  assert.deepEqual(fitLines(["a", "b"], 3, 90, measure), ["a", "b"])
})
