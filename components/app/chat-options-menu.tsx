"use client"

import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { Bell, BellOff, CalendarDays, Check, ChevronRight, ContactRound, Download, Eraser, MoreHorizontal, Palette, Search, Timer, type LucideIcon } from "lucide-react"
import { BottomSheet } from "@/components/app/bottom-sheet"
import { ChatSearchDialog } from "@/components/app/chat-search-dialog"
import { ClearChatDialog } from "@/components/app/clear-chat-dialog"
import { ContactInfoDialog } from "@/components/app/contact-info-dialog"
import { JumpToDateDialog } from "@/components/app/jump-to-date-dialog"
import { MuteMenuItem, useMuteToggle } from "@/components/app/mute-conversation-button"
import { TimerMenuItem, TimerNote, useTimerChoice } from "@/components/app/message-timer-button"
import { WallpaperDialog } from "@/components/app/wallpaper-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import type { WallpaperKey } from "@/lib/chat-wallpapers"
import { MESSAGE_TIMERS, timerLabel } from "@/lib/message-timers"
import { cn } from "@/lib/utils"

// The file name the server gives an export, when the response doesn't say.
const FALLBACK_NAME = "rhenko-chat.txt"

// Phones get the options as a drawer that rises from the bottom and can be dragged. Anything wider keeps the menu.
const PHONE_QUERY = "(max-width: 639px)"
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}

const TRIGGER = "tap-44 grid size-11 place-items-center rounded-full text-foreground transition-colors hover:bg-muted"
const TRIGGER_ICON = <MoreHorizontal className="size-[22px]" strokeWidth={1.9} aria-hidden="true" />

// One row of the phone drawer: the same actions as the menu, at a size a thumb can hit.
function DrawerRow({
  icon: Icon,
  label,
  value,
  chevron,
  expanded,
  destructive,
  disabled,
  onSelect,
}: {
  icon: LucideIcon
  label: string
  value?: string
  chevron?: boolean
  expanded?: boolean
  destructive?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-expanded={chevron ? expanded : undefined}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] transition-colors hover:bg-muted active:bg-muted disabled:opacity-50",
        destructive ? "text-destructive" : "text-foreground"
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {value || chevron ? (
        <span className="flex shrink-0 items-center gap-1 text-[13px] text-muted-foreground">
          {value ? <span className="tabular-nums">{value}</span> : null}
          {chevron ? <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} aria-hidden="true" /> : null}
        </span>
      ) : null}
    </button>
  )
}

// Mute stays open after a tap, so the row's label changes in place.
function MuteDrawerRow({ conversationId, muted }: { conversationId: string; muted: boolean }) {
  const { pending, toggle } = useMuteToggle(conversationId)
  return (
    <DrawerRow
      icon={muted ? BellOff : Bell}
      label={muted ? "Unmute conversation" : "Mute conversation"}
      disabled={pending}
      onSelect={toggle}
    />
  )
}

// Disappearing messages opens in place: the choices unfold under the row, and the one in use has a tick.
function TimerDrawer({ conversationId, timer, disabled }: { conversationId: string; timer: number; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const { pending, choose } = useTimerChoice(conversationId, timer)

  return (
    <>
      <DrawerRow
        icon={Timer}
        label="Disappearing messages"
        value={timer > 0 ? timerLabel(timer) : "Off"}
        chevron
        expanded={open}
        disabled={disabled}
        onSelect={() => setOpen((value) => !value)}
      />
      {open && !disabled ? (
        <div className="mb-1 flex flex-col gap-0.5 rounded-2xl bg-muted p-1">
          {MESSAGE_TIMERS.map((choice) => (
            <button
              key={choice.ms}
              type="button"
              disabled={pending}
              onClick={() => choose(choice.ms)}
              className="flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-[15px] text-foreground transition-colors hover:bg-background active:bg-background disabled:opacity-50"
            >
              {choice.label}
              {choice.ms === timer ? <Check className="size-4" aria-hidden="true" /> : null}
            </button>
          ))}
          <TimerNote />
        </div>
      ) : null}
    </>
  )
}

// The chat's own options, from the header: search its words, jump to a day, see who is in it, mute it, set disappearing messages,
// choose its background, export it, and clear this person's copy. Each opens a dialog over the thread, or saves a file. The
// header keeps to the call, the video call and this menu, on every screen size.
export function ChatOptionsMenu({
  conversationId,
  wallpaper,
  muted,
  timer,
  timerDisabled,
}: {
  conversationId: string
  wallpaper: WallpaperKey
  muted: boolean
  timer: number
  timerDisabled: boolean
}) {
  const phone = useIsPhone()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [wallpaperOpen, setWallpaperOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  // Downloads the chat as a text file. A refusal from the server is shown as it is written there.
  async function exportChat() {
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/export`)
      if (!response.ok) {
        toast.error((await response.text()) || "Couldn't export this chat. Try again.")
        return
      }
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? FALLBACK_NAME
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error("Couldn't export this chat. Check your connection and try again.")
    }
  }

  // On a phone the drawer closes first, then the chosen dialog opens over the thread.
  function opener(setter: (value: boolean) => void) {
    return () => {
      setSheetOpen(false)
      setter(true)
    }
  }

  return (
    <>
      {phone ? (
        <>
          <button type="button" aria-label="Chat options" title="Chat options" onClick={() => setSheetOpen(true)} className={TRIGGER}>
            {TRIGGER_ICON}
          </button>
          <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} label="Chat options">
            <div className="flex flex-col gap-0.5 p-2">
              <DrawerRow icon={Search} label="Search in chat" onSelect={opener(setSearchOpen)} />
              <DrawerRow icon={CalendarDays} label="Jump to a date" onSelect={opener(setDateOpen)} />
              <DrawerRow icon={ContactRound} label="Contact info" onSelect={opener(setContactOpen)} />
              <MuteDrawerRow conversationId={conversationId} muted={muted} />
              <TimerDrawer conversationId={conversationId} timer={timer} disabled={timerDisabled} />
              <DrawerRow icon={Palette} label="Chat wallpaper" onSelect={opener(setWallpaperOpen)} />
              <DrawerRow
                icon={Download}
                label="Export chat"
                onSelect={() => {
                  setSheetOpen(false)
                  void exportChat()
                }}
              />
              <DrawerRow icon={Eraser} label="Clear chat" destructive onSelect={opener(setClearOpen)} />
            </div>
          </BottomSheet>
        </>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Chat options" title="Chat options" className={TRIGGER}>
            {TRIGGER_ICON}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-72">
            <DropdownMenuItem onClick={() => setSearchOpen(true)}>
              <Search className="size-4" aria-hidden="true" />
              Search in chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDateOpen(true)}>
              <CalendarDays className="size-4" aria-hidden="true" />
              Jump to a date
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setContactOpen(true)}>
              <ContactRound className="size-4" aria-hidden="true" />
              Contact info
            </DropdownMenuItem>
            <MuteMenuItem conversationId={conversationId} muted={muted} />
            <TimerMenuItem conversationId={conversationId} timer={timer} disabled={timerDisabled} />
            <DropdownMenuItem onClick={() => setWallpaperOpen(true)}>
              <Palette className="size-4" aria-hidden="true" />
              Chat wallpaper
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportChat}>
              <Download className="size-4" aria-hidden="true" />
              Export chat
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setClearOpen(true)}>
              <Eraser className="size-4" aria-hidden="true" />
              Clear chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {searchOpen ? <ChatSearchDialog conversationId={conversationId} onOpenChange={setSearchOpen} /> : null}
      {dateOpen ? <JumpToDateDialog conversationId={conversationId} onOpenChange={setDateOpen} /> : null}
      {contactOpen ? <ContactInfoDialog conversationId={conversationId} onOpenChange={setContactOpen} /> : null}
      {wallpaperOpen ? <WallpaperDialog conversationId={conversationId} current={wallpaper} onOpenChange={setWallpaperOpen} /> : null}
      {clearOpen ? <ClearChatDialog conversationId={conversationId} onOpenChange={setClearOpen} /> : null}
    </>
  )
}
