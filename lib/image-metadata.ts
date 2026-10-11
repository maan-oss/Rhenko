// Removes the information a photo carries about where and how it was taken: EXIF (location, camera, time), XMP, IPTC,
// text chunks and comments. The picture itself is copied byte for byte, so nothing visible changes. A file whose
// structure cannot be read returns null, and the upload is refused.

export function stripImageMetadata(buf: Buffer, mime: string): Buffer | null {
  if (mime === "image/jpeg") return stripJpeg(buf)
  if (mime === "image/png") return stripPng(buf)
  if (mime === "image/webp") return stripWebp(buf)
  if (mime === "image/gif") return stripGif(buf)
  return null
}

// JPEG: a run of segments, each marked FF xx with a two-byte length, then the picture data from the start-of-scan marker on.
// APP1 (EXIF and XMP), APP12, APP13 (IPTC) and COM are dropped. JFIF, colour profiles and the rest are kept.
const JPEG_DROP = new Set([0xe1, 0xec, 0xed, 0xfe])

function stripJpeg(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  const parts: Buffer[] = [buf.subarray(0, 2)]
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null
    // Fill bytes may come before a marker.
    while (i < buf.length && buf[i] === 0xff) i++
    if (i >= buf.length) return null
    const marker = buf[i]
    i += 1
    if (marker === 0xd9) {
      parts.push(Buffer.from([0xff, 0xd9]))
      return Buffer.concat(parts)
    }
    // Markers without a length: restart markers and the temporary marker.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(Buffer.from([0xff, marker]))
      continue
    }
    if (i + 2 > buf.length) return null
    const length = buf.readUInt16BE(i)
    if (length < 2 || i + length > buf.length) return null
    const segment = Buffer.concat([Buffer.from([0xff, marker]), buf.subarray(i, i + length)])
    if (!JPEG_DROP.has(marker)) parts.push(segment)
    i += length
    if (marker === 0xda) {
      // Start of scan: the entropy-coded picture data and the end marker follow unchanged.
      parts.push(buf.subarray(i))
      return Buffer.concat(parts)
    }
  }
  return null
}

// PNG: a signature, then chunks of length, type, data and CRC. Text chunks and the EXIF chunk are dropped; the CRCs of
// the chunks that stay are unchanged, so the file stays valid.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"])

function stripPng(buf: Buffer): Buffer | null {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  const parts: Buffer[] = [PNG_SIGNATURE]
  let i = 8
  let ended = false
  while (i < buf.length) {
    if (i + 12 > buf.length) return null
    const length = buf.readUInt32BE(i)
    const type = buf.subarray(i + 4, i + 8).toString("latin1")
    const end = i + 12 + length
    if (end > buf.length) return null
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(i, end))
    i = end
    if (type === "IEND") {
      ended = true
      break
    }
  }
  if (!ended) return null
  return Buffer.concat(parts)
}

// WebP: a RIFF container of chunks. EXIF and XMP chunks are dropped, their flags are cleared in the VP8X header, and the
// RIFF size is recalculated.
const WEBP_DROP = new Set(["EXIF", "XMP "])
const VP8X_EXIF = 0x08
const VP8X_XMP = 0x04

function stripWebp(buf: Buffer): Buffer | null {
  if (buf.length < 12 || buf.subarray(0, 4).toString("latin1") !== "RIFF" || buf.subarray(8, 12).toString("latin1") !== "WEBP") return null
  const chunks: Buffer[] = []
  let i = 12
  while (i < buf.length) {
    if (i + 8 > buf.length) return null
    const type = buf.subarray(i, i + 4).toString("latin1")
    const size = buf.readUInt32LE(i + 4)
    const padded = size + (size % 2)
    const end = i + 8 + padded
    if (end > buf.length) return null
    if (!WEBP_DROP.has(type)) {
      const chunk = Buffer.from(buf.subarray(i, end))
      if (type === "VP8X" && size >= 1) chunk[8] &= ~(VP8X_EXIF | VP8X_XMP)
      chunks.push(chunk)
    }
    i = end
  }
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks])
  const header = Buffer.alloc(8)
  header.write("RIFF", 0, "latin1")
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

// GIF: a header, a logical screen with an optional colour table, then blocks. Comment extensions and XMP application
// extensions are dropped. Image data and the other extensions are kept.
function stripGif(buf: Buffer): Buffer | null {
  if (buf.length < 13 || buf.subarray(0, 3).toString("latin1") !== "GIF") return null
  const parts: Buffer[] = []
  let i = 6
  const packed = buf[10]
  const screenTable = packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0
  i += 7
  if (i + screenTable > buf.length) return null
  parts.push(buf.subarray(0, i + screenTable))
  i += screenTable

  while (i < buf.length) {
    const block = buf[i]
    if (block === 0x3b) {
      parts.push(buf.subarray(i, i + 1))
      return Buffer.concat(parts)
    }
    if (block === 0x21) {
      if (i + 2 > buf.length) return null
      const label = buf[i + 1]
      const subStart = i + 2
      const subEnd = skipSubBlocks(buf, subStart)
      if (subEnd === null) return null
      const isXmp = label === 0xff && buf.subarray(subStart + 1, subStart + 12).toString("latin1") === "XMP DataXMP"
      if (label !== 0xfe && !isXmp) parts.push(buf.subarray(i, subEnd))
      i = subEnd
      continue
    }
    if (block === 0x2c) {
      if (i + 10 > buf.length) return null
      const imagePacked = buf[i + 9]
      const localTable = imagePacked & 0x80 ? 3 * 2 ** ((imagePacked & 0x07) + 1) : 0
      const dataStart = i + 10 + localTable + 1
      if (dataStart > buf.length) return null
      const end = skipSubBlocks(buf, dataStart)
      if (end === null) return null
      parts.push(buf.subarray(i, end))
      i = end
      continue
    }
    return null
  }
  return null
}

// Moves past a run of data sub-blocks (a length byte, then that many bytes) and its zero terminator. Returns the offset after it.
function skipSubBlocks(buf: Buffer, start: number): number | null {
  let i = start
  while (i < buf.length) {
    const size = buf[i]
    i += 1
    if (size === 0) return i
    i += size
    if (i > buf.length) return null
  }
  return null
}
