"use client"

import { motion } from "motion/react"
import { MicOff } from "lucide-react"
import { Avatar } from "@/components/app/avatar"
import type { EventPerson } from "@/lib/bus"
import type { CallTile, TileStatus } from "@/lib/call-engine"
import { cn } from "@/lib/utils"

const STATUS: Record<TileStatus, string | null> = {
  connecting: "Connecting…",
  connected: null,
  reconnecting: "Reconnecting…",
  failed: "Couldn't connect",
}

// Everyone in a group call, you first. Each tile names the person and says how their connection is doing. On a phone
// the tiles stack two across with the avatar on top; in the desktop card they are rows, two across.
export function GroupCallTiles({ self, tiles, muted, size }: { self: EventPerson; tiles: CallTile[]; muted: boolean; size: "card" | "screen" }) {
  const big = size === "screen"
  return (
    <ul aria-label="People in the call" className={cn("grid grid-cols-2", big ? "gap-2.5" : "gap-2")}>
      <Tile person={self} name="You" status={muted ? "Muted" : "Mic on"} muted={muted} pending={false} failed={false} big={big} />
      {tiles.map((tile) => (
        <Tile
          key={tile.key}
          person={tile.person}
          name={tile.person.name}
          status={STATUS[tile.status]}
          muted={false}
          pending={tile.status === "connecting" || tile.status === "reconnecting"}
          failed={tile.status === "failed"}
          big={big}
        />
      ))}
    </ul>
  )
}

function Tile({
  person,
  name,
  status,
  muted,
  pending,
  failed,
  big,
}: {
  person: EventPerson
  name: string
  status: string | null
  muted: boolean
  pending: boolean
  failed: boolean
  big: boolean
}) {
  return (
    <li
      className={cn(
        "flex min-w-0 rounded-[20px] border border-border/70 bg-muted/50",
        big ? "flex-col items-center gap-1.5 px-3 pt-3.5 pb-3 text-center" : "items-center gap-2 py-2 pr-2.5 pl-2"
      )}
    >
      <span className="relative inline-grid shrink-0 place-items-center">
        {pending ? (
          <motion.span
            aria-hidden="true"
            className="absolute -inset-[4px] rounded-full border-2 border-dusk/40"
            animate={{ opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : null}
        <Avatar user={person} size={big ? 56 : 32} className={cn(failed && "opacity-45 grayscale")} />
        {muted ? (
          <span
            className={cn(
              "absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-foreground text-background ring-2 ring-popover",
              big ? "size-[22px]" : "size-[18px]"
            )}
          >
            <MicOff className={big ? "size-[12px]" : "size-[10px]"} strokeWidth={2.4} aria-hidden="true" />
          </span>
        ) : null}
      </span>
      <span className={cn("min-w-0", big ? "w-full" : "flex-1")}>
        <span className={cn("block truncate font-medium", big ? "text-[15px] leading-5" : "text-[13px] leading-[18px]")}>{name}</span>
        <span
          className={cn(
            "block truncate",
            big ? "h-[18px] text-[13px] leading-[18px]" : "h-4 text-[12px] leading-4",
            failed ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {status ?? (big ? "" : "Connected")}
        </span>
      </span>
    </li>
  )
}
