"use client"

import { useTransition } from "react"
import { Timer } from "lucide-react"
import { toast } from "sonner"
import { setMessageTimer } from "@/actions/messages"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MESSAGE_TIMERS, timerLabel, timerLine, timerShort } from "@/lib/message-timers"
import { cn } from "@/lib/utils"

// The choices, as radio rows. Choosing one sets it for the whole conversation and says so; the rows wait while it is saved.
function TimerChoices({ conversationId, timer }: { conversationId: string; timer: number }) {
  const [pending, startTransition] = useTransition()

  function choose(next: number) {
    if (next === timer) return
    startTransition(async () => {
      const result = await setMessageTimer(conversationId, next)
      if (result.ok) toast.success(`${timerLine(next)}.`)
      else toast.error(result.error)
    })
  }

  return (
    <DropdownMenuRadioGroup value={timer} onValueChange={(value) => choose(Number(value))}>
      {MESSAGE_TIMERS.map((choice) => (
        <DropdownMenuRadioItem
          key={choice.ms}
          value={choice.ms}
          closeOnClick
          disabled={pending}
          className="min-h-10 rounded-xl py-2 pr-9 pl-3 text-[15px] max-sm:min-h-11"
        >
          {choice.label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function TimerNote() {
  return (
    <p className="px-3 pt-1.5 pb-2 text-[13px] leading-snug text-muted-foreground">
      Applies to messages sent after it changes. Messages already sent keep the timer they had. Everyone here sees the change in the chat.
    </p>
  )
}

// The disappearing-messages timer in a conversation's header. Everyone in the conversation sees the same setting: while it
// is on, the button carries a small badge with the length ("24h"), and anyone who has joined can change it from the menu.
// The menu is a sheet from the bottom on a phone, as every menu is. A change applies to the messages sent after it.
export function MessageTimerButton({ conversationId, timer, disabled }: { conversationId: string; timer: number; disabled?: boolean }) {
  const on = timer > 0
  const label = `Disappearing messages: ${on ? timerLabel(timer) : "off"}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            title={disabled ? "Accept the request to change this" : label}
            className="size-11 rounded-full"
          />
        }
      >
        <Timer className="size-[22px]" strokeWidth={1.9} />
        {on ? (
          <span
            aria-hidden="true"
            className="metal pointer-events-none absolute -right-1.5 -bottom-1 h-[15px] rounded-full px-1 text-xs leading-[15px] font-semibold tabular-nums ring-2 ring-background"
          >
            {timerShort(timer)}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pt-2 pb-1.5 text-[13px] font-semibold">Disappearing messages</DropdownMenuLabel>
          <TimerChoices conversationId={conversationId} timer={timer} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <TimerNote />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The same choices as a submenu row, for the phone's options menu. The header has no room for the timer button there.
export function TimerMenuItem({ conversationId, timer, disabled, className }: { conversationId: string; timer: number; disabled?: boolean; className?: string }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled} title={disabled ? "Accept the request to change this" : undefined} className={cn(className)}>
        <Timer className="size-4" aria-hidden="true" />
        Disappearing messages
        <span className="ml-auto pl-3 text-[13px] text-muted-foreground tabular-nums">{timer > 0 ? timerLabel(timer) : "Off"}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pt-2 pb-1.5 text-[13px] font-semibold">Disappearing messages</DropdownMenuLabel>
          <TimerChoices conversationId={conversationId} timer={timer} />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <TimerNote />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
