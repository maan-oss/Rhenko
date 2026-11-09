// The text layout for a picture of a post (components/app/post-picture.ts draws it). Lines are broken where the words no longer
// fit the width the picture gives them, a word wider than a line is broken at its letters, and text that is cut short ends
// with an ellipsis. `measure` returns the width of a string in the same units as `maxWidth`.

export type Measure = (text: string) => number

// Splits text into lines no wider than maxWidth. A paragraph break in the text is a line break, and an empty paragraph is an
// empty line.
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push("")
      continue
    }
    let line = ""
    for (const word of words) {
      for (const piece of breakWord(word, maxWidth, measure)) {
        const candidate = line ? `${line} ${piece}` : piece
        if (line && measure(candidate) > maxWidth) {
          lines.push(line)
          line = piece
        } else {
          line = candidate
        }
      }
    }
    lines.push(line)
  }
  return lines
}

// Keeps the first maxLines lines. When there were more, the last kept line ends with an ellipsis.
export function fitLines(lines: string[], maxLines: number, maxWidth: number, measure: Measure): string[] {
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = withEllipsis(kept[maxLines - 1], maxWidth, measure)
  return kept
}

// Shortens text to fit maxWidth. Text that already fits comes back as it is.
export function ellipsize(text: string, maxWidth: number, measure: Measure): string {
  return measure(text) <= maxWidth ? text : withEllipsis(text, maxWidth, measure)
}

function withEllipsis(text: string, maxWidth: number, measure: Measure): string {
  const chars = Array.from(text.trimEnd())
  let end = chars.length
  while (end > 0 && measure(`${chars.slice(0, end).join("").trimEnd()}…`) > maxWidth) end--
  return `${chars.slice(0, end).join("").trimEnd()}…`
}

function breakWord(word: string, maxWidth: number, measure: Measure): string[] {
  if (measure(word) <= maxWidth) return [word]
  const pieces: string[] = []
  let current = ""
  for (const char of word) {
    if (current && measure(current + char) > maxWidth) {
      pieces.push(current)
      current = char
    } else {
      current += char
    }
  }
  if (current) pieces.push(current)
  return pieces
}
