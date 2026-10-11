// Files the suite makes and reads: a small PNG to upload, and a reader for the account export (a ZIP).
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { createRequire } from "node:module"
import { OUT, REPO_ROOT } from "./env.mjs"

function crcOf(buffer) {
  return zlib.crc32(buffer)
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crcOf(body))
  return Buffer.concat([length, body, crc])
}

// A real PNG, written to disk: a diagonal gradient whose colours depend on `seed`, so two files differ.
export function makePng(name, { width = 96, height = 64, seed = 1 } = {}) {
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)
    row[0] = 0
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = (x * 255) / width
      row[2 + x * 3] = (y * 255) / height
      row[3 + x * 3] = (seed * 53 + x + y) % 256
    }
    rows.push(row)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ])
  const folder = path.join(OUT, "fixtures")
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, name)
  fs.writeFileSync(file, png)
  return file
}

// A real JPEG that carries location-style EXIF text and a comment, written to disk. Made with the same image library the
// app uses in its build scripts, so the file is a genuine photo with metadata, not a hand-built imitation.
export async function makeExifJpeg(name, marker) {
  const requireFromRepo = createRequire(path.join(REPO_ROOT, "package.json"))
  const sharp = requireFromRepo("sharp")
  const jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#4a6" } })
    .jpeg()
    .withExifMerge({ IFD0: { Copyright: marker, Artist: marker }, GPS: { GPSLatitudeRef: "N", GPSLongitudeRef: "E" } })
    .toBuffer()
  // The check below only means something if the fixture really carries the details it is meant to lose.
  const carried = await sharp(jpeg).metadata()
  if (!carried.exif || !carried.exif.includes(Buffer.from(marker))) throw new Error("the test photo did not get its EXIF details")
  const folder = path.join(OUT, "fixtures")
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, name)
  fs.writeFileSync(file, jpeg)
  return file
}

// A file that claims to be a PNG and is not. The server must refuse it.
export function makeFakePng(name) {
  const folder = path.join(OUT, "fixtures")
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, name)
  fs.writeFileSync(file, "this is plain text, not an image")
  return file
}

// Reads a ZIP held in memory. Returns a Map of file name to contents, after checking each file's size and checksum.
export function readZip(buffer) {
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error("the download is not a ZIP file: it does not start with PK\\x03\\x04")
  }
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error("the ZIP has no end-of-directory record")
  const count = buffer.readUInt16LE(end + 10)
  let at = buffer.readUInt32LE(end + 16)
  const files = new Map()
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error(`the ZIP directory is damaged at entry ${n}`)
    const method = buffer.readUInt16LE(at + 10)
    const crc = buffer.readUInt32LE(at + 16)
    const packed = buffer.readUInt32LE(at + 20)
    const size = buffer.readUInt32LE(at + 24)
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const localAt = buffer.readUInt32LE(at + 42)
    const name = buffer.toString("utf8", at + 46, at + 46 + nameLength)
    if (buffer.readUInt32LE(localAt) !== 0x04034b50) throw new Error(`the ZIP entry ${name} has no local header`)
    const localName = buffer.readUInt16LE(localAt + 26)
    const localExtra = buffer.readUInt16LE(localAt + 28)
    const start = localAt + 30 + localName + localExtra
    const raw = buffer.subarray(start, start + packed)
    let data
    if (method === 0) data = raw
    else if (method === 8) data = zlib.inflateRawSync(raw)
    else throw new Error(`the ZIP entry ${name} uses compression method ${method}, which the suite cannot read`)
    if (data.length !== size) throw new Error(`the ZIP entry ${name} is ${data.length} bytes, the directory says ${size}`)
    if (crcOf(data) !== crc) throw new Error(`the ZIP entry ${name} fails its checksum`)
    files.set(name, data)
    at += 46 + nameLength + extraLength + commentLength
  }
  return files
}
