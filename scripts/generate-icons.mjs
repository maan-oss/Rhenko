// Builds the app icons from public/icon.svg.
//
//   node scripts/generate-icons.mjs
//
// Writes into public/icons:
//   icon-192.png, icon-512.png     the tile as drawn, with rounded corners (manifest, purpose "any")
//   icon-512-maskable.png          full bleed, for the shapes Android cuts icons into (purpose "maskable")
//   apple-touch-icon.png           180px, full bleed and opaque, which iOS needs
//   favicon.ico                    16, 32 and 48px frames with a larger mark, for the browser tab
//
// The tile and the mark come from the SVG, so change the artwork there and run this again.
// Next.js serves app/favicon.ico as the tab icon, so copy favicon.ico there to replace it.
// Needs sharp, which comes with Next.js as an optional dependency.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

let sharp
try {
  sharp = (await import("sharp")).default
} catch {
  console.error("sharp is not installed. Run npm install, then run this again.")
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(root, "public", "icon.svg")
const outDir = path.join(root, "public", "icons")

const INK = "#0a0a0a"
// The part of a maskable icon that every platform mask keeps: a circle of 80% of the width.
const SAFE_RADIUS = 0.4
// The mark is lighter than every part of the tile, so a mid grey cleanly separates them.
const MARK_LEVEL = 140
// The browser tab is tiny, so its mark is drawn larger than on the app icons.
const FAVICON_MARK_SCALE = 1.2

const svg = await readFile(source, "utf8")
const rootTag = /<svg\b/.exec(svg)
const rect = /<rect\b[^>]*\/>/.exec(svg)?.[0]
const mark = /<path\b[^>]*\/>/.exec(svg)?.[0]
if (!rootTag || !rect || !mark || !/\srx="/.test(rect)) {
  console.error("public/icon.svg needs an <svg>, a rounded <rect> for the tile and a <path> for the mark. Fix it, then run this again.")
  process.exit(1)
}

function sized(markup, size) {
  return Buffer.from(markup.replace(/<svg\b/, `<svg width="${size}" height="${size}"`))
}

const fullBleed = svg.replace(rect, rect.replace(/\srx="[^"]*"/, ""))
const enlarged = svg.replace(
  mark,
  `<g transform="translate(256 256) scale(${FAVICON_MARK_SCALE}) translate(-256 -256)">${mark}</g>`
)

const tile = (size) => sharp(sized(svg, size)).png({ compressionLevel: 9 }).toBuffer()
const bleed = (size) =>
  sharp(sized(fullBleed, size)).flatten({ background: INK }).png({ compressionLevel: 9 }).toBuffer()

// How far the mark reaches from the centre, as a share of the icon's width.
async function reach(png, size) {
  const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true })
  const middle = (size - 1) / 2
  let far = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x] > MARK_LEVEL) far = Math.max(far, Math.hypot(x - middle, y - middle))
    }
  }
  return far / size
}

// An .ico file is a small header, one directory entry per frame, then the frames. Each frame is a PNG.
function ico(frames) {
  const head = Buffer.alloc(6 + 16 * frames.length)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(frames.length, 4)
  let offset = head.length
  frames.forEach(({ size, png }, index) => {
    const at = 6 + 16 * index
    head.writeUInt8(size, at)
    head.writeUInt8(size, at + 1)
    head.writeUInt16LE(1, at + 4)
    head.writeUInt16LE(32, at + 6)
    head.writeUInt32LE(png.length, at + 8)
    head.writeUInt32LE(offset, at + 12)
    offset += png.length
  })
  return Buffer.concat([head, ...frames.map((frame) => frame.png)])
}

const maskable = await bleed(512)
const maskableReach = await reach(maskable, 512)
if (maskableReach > SAFE_RADIUS) {
  console.error(
    `The mark reaches ${(maskableReach * 100).toFixed(1)}% of the width from the centre, past the ${SAFE_RADIUS * 100}% a maskable icon allows. Make it smaller in public/icon.svg.`
  )
  process.exit(1)
}

const faviconFrames = []
for (const size of [16, 32, 48]) {
  const png = await sharp(sized(enlarged, size)).png({ compressionLevel: 9 }).toBuffer()
  faviconFrames.push({ size, png })
}

const files = [
  ["icon-192.png", await tile(192)],
  ["icon-512.png", await tile(512)],
  ["icon-512-maskable.png", maskable],
  ["apple-touch-icon.png", await bleed(180)],
  ["favicon.ico", ico(faviconFrames)],
]

await mkdir(outDir, { recursive: true })
for (const [name, data] of files) {
  await writeFile(path.join(outDir, name), data)
  const note = name.endsWith(".png") ? `${(await sharp(data).metadata()).width}px` : "16, 32 and 48px"
  console.log(`public/icons/${name}  ${note}  ${(data.length / 1024).toFixed(1)} KB`)
}
console.log(`The mark stays within ${(maskableReach * 100).toFixed(1)}% of the width from the centre of the maskable icon, inside the ${SAFE_RADIUS * 100}% safe zone.`)
