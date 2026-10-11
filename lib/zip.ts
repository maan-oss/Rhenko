// A small ZIP writer. Entries are stored as they are, without compression: photos and videos are compressed
// already, and it keeps the writer short. It writes the classic ZIP layout (local file headers, a central
// directory and an end record), so one archive holds up to 65,535 entries and just under 4 GB.

export const ZIP_MAX_ENTRIES = 0xffff
export const ZIP_MAX_BYTES = 0xffffffff

const LOCAL_HEADER = 30
const CENTRAL_HEADER = 46
const END_RECORD = 22
// Version 2.0 is enough to extract stored files and folders.
const VERSION_NEEDED = 20
// Made on Unix, so the permission bits in the external attributes apply when unzipping.
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED
// Bit 11: names are UTF-8.
const UTF8_NAMES = 0x0800
const FILE_MODE = 0o100644 * 0x10000
const FOLDER_MODE = 0o40755 * 0x10000 + 0x10

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// The size of an archive holding these entries, so a caller can check that it fits before writing anything.
export function zipSize(entries: { name: string; size: number }[]): number {
  let total = END_RECORD
  for (const entry of entries) {
    const nameLength = Buffer.byteLength(entry.name, "utf8")
    total += LOCAL_HEADER + nameLength + entry.size + CENTRAL_HEADER + nameLength
  }
  return total
}

// Dates in ZIP files are local time in MS-DOS form, which starts in 1980 and counts seconds in twos.
function dosStamp(date: Date): { time: number; date: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

type Written = { name: Buffer; crc: number; size: number; offset: number; folder: boolean }

export class ZipWriter {
  private readonly written: Written[] = []
  private offset = 0
  private readonly stamp: { time: number; date: number }

  constructor(modified = new Date()) {
    this.stamp = dosStamp(modified)
  }

  // A folder entry such as "media/", so the folder exists even when it holds nothing.
  folder(name: string): Uint8Array[] {
    return this.entry(name.endsWith("/") ? name : `${name}/`, new Uint8Array(0), true)
  }

  // One file: its local header, then its bytes. Send the chunks in order.
  file(name: string, data: Uint8Array): Uint8Array[] {
    return this.entry(name, data, false)
  }

  // The central directory and the end record. Call once, after the last entry.
  finish(): Uint8Array {
    const records: Buffer[] = []
    let directorySize = 0
    for (const entry of this.written) {
      const record = Buffer.alloc(CENTRAL_HEADER + entry.name.length)
      record.writeUInt32LE(0x02014b50, 0)
      record.writeUInt16LE(VERSION_MADE_BY, 4)
      record.writeUInt16LE(VERSION_NEEDED, 6)
      record.writeUInt16LE(UTF8_NAMES, 8)
      record.writeUInt16LE(0, 10) // stored, no compression
      record.writeUInt16LE(this.stamp.time, 12)
      record.writeUInt16LE(this.stamp.date, 14)
      record.writeUInt32LE(entry.crc, 16)
      record.writeUInt32LE(entry.size, 20) // compressed size
      record.writeUInt32LE(entry.size, 24) // uncompressed size
      record.writeUInt16LE(entry.name.length, 28)
      record.writeUInt16LE(0, 30) // extra field length
      record.writeUInt16LE(0, 32) // comment length
      record.writeUInt16LE(0, 34) // disk number
      record.writeUInt16LE(0, 36) // internal attributes
      record.writeUInt32LE(entry.folder ? FOLDER_MODE : FILE_MODE, 38)
      record.writeUInt32LE(entry.offset, 42)
      entry.name.copy(record, CENTRAL_HEADER)
      records.push(record)
      directorySize += record.length
    }
    if (this.offset + directorySize + END_RECORD > ZIP_MAX_BYTES) throw new RangeError("ZIP archives hold up to 4 GB.")
    const end = Buffer.alloc(END_RECORD)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4) // this disk
    end.writeUInt16LE(0, 6) // disk where the directory starts
    end.writeUInt16LE(this.written.length, 8)
    end.writeUInt16LE(this.written.length, 10)
    end.writeUInt32LE(directorySize, 12)
    end.writeUInt32LE(this.offset, 16)
    end.writeUInt16LE(0, 20) // comment length
    records.push(end)
    return Buffer.concat(records)
  }

  private entry(name: string, data: Uint8Array, folder: boolean): Uint8Array[] {
    if (this.written.length >= ZIP_MAX_ENTRIES) throw new RangeError("ZIP archives hold up to 65,535 entries.")
    const nameBytes = Buffer.from(name, "utf8")
    if (nameBytes.length > 0xffff) throw new RangeError("That file name is too long for a ZIP archive.")
    const header = Buffer.alloc(LOCAL_HEADER + nameBytes.length)
    const crc = crc32(data)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(VERSION_NEEDED, 4)
    header.writeUInt16LE(UTF8_NAMES, 6)
    header.writeUInt16LE(0, 8) // stored, no compression
    header.writeUInt16LE(this.stamp.time, 10)
    header.writeUInt16LE(this.stamp.date, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(data.length, 18) // compressed size
    header.writeUInt32LE(data.length, 22) // uncompressed size
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(0, 28) // extra field length
    nameBytes.copy(header, LOCAL_HEADER)
    const next = this.offset + header.length + data.length
    if (next > ZIP_MAX_BYTES) throw new RangeError("ZIP archives hold up to 4 GB.")
    this.written.push({ name: nameBytes, crc, size: data.length, offset: this.offset, folder })
    this.offset = next
    return data.length > 0 ? [header, data] : [header]
  }
}
