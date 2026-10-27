import Link from "@/components/app/link"
import { Download, FileArchive, FileSpreadsheet, FileText, MapPin, Presentation } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import type { MiniUser } from "@/lib/data"
import { extensionOf, sizeLabel } from "@/lib/message-attachments"
import { cn } from "@/lib/utils"

// What a chat message carries besides its text, drawn as a card that fits a bubble. The bubble decides the colours, so
// each card takes `mine` and uses the bubble's own ink.

const CARD = "flex w-full min-w-0 max-w-[300px] items-center gap-3 rounded-xl p-2.5 text-left no-underline transition-colors duration-200"

function cardTone(mine: boolean): string {
  return mine ? "bg-background/15 text-background hover:bg-background/25" : "bg-background text-foreground hover:bg-foreground/5"
}

function Tile({ children }: { children: React.ReactNode }) {
  return <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-foreground/10">{children}</span>
}

// A document: its name, its kind and size, and a download. It is never shown inside the page.
export function DocumentCard({ file, name, size, mine }: { file: string; name: string; size: number; mine: boolean }) {
  const ext = extensionOf(file)
  const Icon = ext === "xlsx" || ext === "csv" ? FileSpreadsheet : ext === "pptx" ? Presentation : ext === "zip" ? FileArchive : FileText
  return (
    <a
      href={`/media/${file}?name=${encodeURIComponent(name)}`}
      download={name}
      data-embed=""
      aria-label={`Download ${name}, ${ext.toUpperCase()}, ${sizeLabel(size)}`}
      className={cn(CARD, cardTone(mine))}
    >
      <Tile>
        <Icon className="size-5" aria-hidden />
      </Tile>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{name}</span>
        <span className="block text-[12px] opacity-70 tabular-nums">
          {ext.toUpperCase()} · {sizeLabel(size)}
        </span>
      </span>
      <Download className="size-4 shrink-0 opacity-70" aria-hidden />
    </a>
  )
}

// A contact: another account in the conversation, with a link to their profile. When the account is gone, the card says so.
export function ContactCard({ user, mine }: { user: MiniUser | null; mine: boolean }) {
  if (!user) {
    return <p className="rounded-xl bg-background px-3 py-2 text-sm text-muted-foreground">This account is no longer here.</p>
  }
  return (
    <Link href={`/${user.handle}`} data-embed="" className={cn(CARD, cardTone(mine))}>
      <Avatar user={user} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{user.name}</span>
        <span className="block truncate text-[12px] opacity-70">@{user.handle}</span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold">View</span>
    </Link>
  )
}

// A place the sender chose to share. It opens in an outside map, so no map picture is loaded here.
export function LocationCard({ lat, lng, mine }: { lat: number; lng: number; mine: boolean }) {
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      data-embed=""
      className={cn(CARD, cardTone(mine))}
    >
      <Tile>
        <MapPin className="size-5" aria-hidden />
      </Tile>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold">Location</span>
        <span className="block text-[12px] opacity-70 tabular-nums">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold">Map</span>
    </a>
  )
}
