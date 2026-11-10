"use client"

import { useSyncExternalStore } from "react"
import Link from "@/components/app/link"
import { ArrowUpRight, Download, MapPin } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import type { MiniUser } from "@/lib/data"
import { extensionOf, sizeLabel } from "@/lib/message-attachments"
import { cn } from "@/lib/utils"

// What a chat message carries besides its text, drawn as a card that sits inside a bubble. A card is always paper-coloured,
// so it reads the same in a sent bubble and a received one, and the time line sits under it inside the bubble.

const SURFACE =
  "flex w-full min-w-0 max-w-[272px] items-center gap-3 rounded-2xl bg-background p-2.5 text-left text-foreground no-underline shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.07] transition-colors duration-200 hover:bg-background/90"

// Each kind of file is drawn in its own look: the colour band and the layout a reader already knows from that format. These are
// stand-ins for the first page, not the file's own pixels: a card never opens or parses the file to draw it.
type Kind = { label: string; name: string; tone: string; face: "grid" | "text" | "slide" | "archive" }

const KINDS: Record<string, Kind> = {
  pdf: { label: "PDF", name: "PDF document", tone: "#D2362C", face: "text" },
  docx: { label: "DOCX", name: "Word document", tone: "#2A5DAA", face: "text" },
  doc: { label: "DOC", name: "Word document", tone: "#2A5DAA", face: "text" },
  xlsx: { label: "XLSX", name: "Excel workbook", tone: "#1D7046", face: "grid" },
  xls: { label: "XLS", name: "Excel workbook", tone: "#1D7046", face: "grid" },
  csv: { label: "CSV", name: "Spreadsheet", tone: "#1D7046", face: "grid" },
  pptx: { label: "PPTX", name: "PowerPoint deck", tone: "#C84D27", face: "slide" },
  txt: { label: "TXT", name: "Text file", tone: "#58616E", face: "text" },
  md: { label: "MD", name: "Text file", tone: "#58616E", face: "text" },
  zip: { label: "ZIP", name: "Archive", tone: "#8A6524", face: "archive" },
}
const PLAIN: Kind = { label: "FILE", name: "File", tone: "#6B7280", face: "text" }

function kindOf(ext: string): Kind {
  return KINDS[ext] ?? PLAIN
}

// The first page of a file, drawn in the file's own colours and layout.
function Page({ kind }: { kind: Kind }) {
  return (
    <span aria-hidden="true" className="relative block h-14 w-11 shrink-0 overflow-hidden rounded-[5px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.08]">
      <span className="absolute inset-x-0 top-0 grid h-[15px] place-items-center text-[7px] font-extrabold tracking-[0.04em] text-white" style={{ background: kind.tone }}>
        {kind.label}
      </span>
      <svg viewBox="0 0 44 56" className="absolute inset-0 size-full" fill="none">
        {kind.face === "grid" ? (
          <>
            <rect x="5" y="21" width="34" height="5" fill={kind.tone} opacity="0.9" />
            {[26, 31, 36, 41, 46, 51].map((y) => (
              <line key={y} x1="5" x2="39" y1={y} y2={y} stroke="#E2DFD8" strokeWidth="1" />
            ))}
            {[14, 23, 32].map((x) => (
              <line key={x} x1={x} x2={x} y1="21" y2="56" stroke="#E2DFD8" strokeWidth="1" />
            ))}
            <rect x="5" y="31" width="9" height="5" fill={kind.tone} opacity="0.12" />
          </>
        ) : kind.face === "slide" ? (
          <>
            <rect x="5" y="21" width="34" height="22" rx="2" fill="#F4F1EC" stroke="#E2DDD4" strokeWidth="1" />
            <rect x="9" y="35" width="4" height="6" fill={kind.tone} opacity="0.5" />
            <rect x="15" y="31" width="4" height="10" fill={kind.tone} opacity="0.75" />
            <rect x="21" y="27" width="4" height="14" fill={kind.tone} />
            <rect x="27" y="33" width="4" height="8" fill={kind.tone} opacity="0.6" />
            <rect x="5" y="47" width="24" height="2" rx="1" fill="#D9D5CD" />
            <rect x="5" y="51" width="16" height="2" rx="1" fill="#D9D5CD" />
          </>
        ) : kind.face === "archive" ? (
          <>
            {[21, 25, 29, 33, 37, 41, 45, 49].map((y, i) => (
              <rect key={y} x="19" y={y} width="6" height="3" fill={i % 2 ? "#D9D5CD" : kind.tone} opacity={i % 2 ? 1 : 0.85} />
            ))}
          </>
        ) : (
          <>
            <rect x="7" y="22" width="18" height="3" rx="1.5" fill={kind.tone} opacity="0.85" />
            {[30, 32, 27, 32, 31, 20].map((width, i) => (
              <rect key={i} x="7" y={30 + i * 4.5} width={width} height="2" rx="1" fill="#D9D5CD" />
            ))}
          </>
        )}
      </svg>
    </span>
  )
}

// A document: its page, its name, its kind and size, and a download. It is never shown inside the page.
// A sealed document in an encrypted chat is saved by its own button (onSave) rather than a link: its bytes are opened on the device
// first. `file` is the name the document was sent with, which carries its kind.
export function DocumentCard({ file, name, size, onSave }: { file: string; name: string; size: number; onSave?: () => void }) {
  const ext = extensionOf(file)
  const kind = kindOf(ext)
  const body = (
    <>
      <Page kind={kind} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-snug">{name}</span>
        <span className="block truncate text-[12px] leading-snug text-muted-foreground tabular-nums">
          {kind.name} · {sizeLabel(size)}
        </span>
      </span>
      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-foreground">
        <Download className="size-[15px]" />
      </span>
    </>
  )
  const label = `Download ${name}, ${kind.name}, ${sizeLabel(size)}`
  if (onSave) {
    return (
      <button type="button" onClick={onSave} aria-label={label} className={cn(SURFACE, "cursor-pointer")}>
        {body}
      </button>
    )
  }
  return (
    <a href={`/media/${file}?name=${encodeURIComponent(name)}`} download={name} data-embed="" aria-label={label} className={SURFACE}>
      {body}
    </a>
  )
}

// A contact: another account in the conversation, with a link to their profile. When the account is gone, the card says so.
export function ContactCard({ user }: { user: MiniUser | null }) {
  if (!user) {
    return <p className="rounded-xl bg-background px-3 py-2 text-sm text-muted-foreground">This account is no longer here.</p>
  }
  return (
    <Link href={`/${user.handle}`} data-embed="" className={SURFACE}>
      <Avatar user={user} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold leading-snug">{user.name}</span>
        <span className="block truncate text-[12px] leading-snug text-muted-foreground">@{user.handle}</span>
      </span>
      <span className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-[12px] font-semibold">Profile</span>
    </Link>
  )
}

// The maps app a viewer's device uses: Apple Maps on Apple devices, Google Maps everywhere else. Read on the device, so the
// server-rendered page and the first client render agree (the server assumes the other map).
const noSubscribe = () => () => {}
function onAppleDevice(): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
}

// A place the sender chose to share. The card draws a map on the page itself, with the pin where the place is, so the viewer's
// browser asks no map server for tiles. The coordinates are never written out: a tap opens the maps app with the place.
export function LocationCard({ lat, lng }: { lat: number; lng: number }) {
  const apple = useSyncExternalStore(noSubscribe, onAppleDevice, () => false)
  const href = apple
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent("Shared location")}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-embed=""
      aria-label="Shared location, open in Maps"
      className="block w-full max-w-[272px] overflow-hidden rounded-2xl bg-background text-foreground no-underline shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.07] transition-colors duration-200 hover:bg-background/90"
    >
      <MapDrawing />
      <span className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-background">
          <MapPin className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">Shared location</span>
        <span className="flex items-center gap-0.5 text-[13px] font-semibold text-muted-foreground">
          Maps
          <ArrowUpRight className="size-3.5" aria-hidden />
        </span>
      </span>
    </a>
  )
}

// A street map drawn in vector: land, a river, a park, the main roads and the side streets, and a pin. It is the same drawing
// for every place, so it says the place is on a map without showing where.
function MapDrawing() {
  return (
    <svg viewBox="0 0 272 118" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="block h-[118px] w-full bg-muted">
      <rect x="150" y="10" width="62" height="36" rx="7" className="fill-foreground/[0.07]" />
      <path d="M0 92 C58 80 104 102 166 90 S246 78 272 86 L272 118 L0 118 Z" className="fill-dusk/[0.16]" />
      <g className="stroke-background" fill="none" strokeLinecap="round">
        <path d="M-6 46 L280 70" strokeWidth="7" />
        <path d="M94 -6 L118 124" strokeWidth="6" />
        <path d="M226 -6 L214 124" strokeWidth="5" />
        <path d="M0 14 H272" strokeWidth="2.5" />
        <path d="M30 0 V118" strokeWidth="2.5" />
        <path d="M0 108 L272 100" strokeWidth="2.5" />
        <path d="M150 4 L162 50" strokeWidth="2" />
      </g>
      <ellipse cx="136" cy="86" rx="7" ry="2.6" className="fill-foreground/[0.18]" />
      <path d="M136 78 C129 70 122 63 122 52 A14 14 0 1 1 150 52 C150 63 143 70 136 78 Z" className="fill-dusk" />
      <circle cx="136" cy="52" r="5" className="fill-background" />
    </svg>
  )
}
