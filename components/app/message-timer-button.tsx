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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MESSAGE_TIMERS, timerLabel, timerLine, timerShort } from "@/lib/message-timers"

// The disappearing-messages timer in a conversation's header. Everyone in the conversation sees the same setting: while it
// is on, the button carries a small badge with the length ("24h"), and anyone who has joined can change it from the menu.
// The menu is a sheet from the bottom on a phone, as every menu is. A change applies to the messages sent after it.
export function MessageTimerButton({ conversationId, timer, disabled }: { conversationId: string; timer: number; disabled?: boolean }) {
  const [pending, startTransition] = useTransition()
  const on = timer > 0
  const label = `Disappearing messages: ${on ? timerLabel(timer) : "off"}`

  function choose(next: number) {
    if (next === timer) return
    startTransition(async () => {
      const result = await setMessageTimer(conversationId, next)
      if (result.ok) toast.success(`${timerLine(next)}.`)
      else toast.error(result.error)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || pending}
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={label}
            aria-busy={pending}
            title={disabled ? "Accept the request to change this" : label}
            className="rounded-full"
          />
        }
      >
        <Timer className="size-4" />
        {on ? (
          <span
            aria-hidden="true"
            className="metal pointer-events-none absolute -right-1.5 -bottom-1 h-[15px] rounded-full px-1 text-[10px] leading-[15px] font-semibold tabular-nums ring-2 ring-background"
          >
            {timerShort(timer)}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 pt-2 pb-1.5 text-[13px] font-semibold">Disappearing messages</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={timer} onValueChange={(value) => choose(Number(value))}>
            {MESSAGE_TIMERS.map((choice) => (
              <DropdownMenuRadioItem
                key={choice.ms}
                value={choice.ms}
                closeOnClick
                className="min-h-10 rounded-xl py-2 pr-9 pl-3 text-[15px] max-sm:min-h-11"
              >
                {choice.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <p className="px-3 pt-1.5 pb-2 text-[13px] leading-snug text-muted-foreground">
          Applies to messages sent after it changes. Messages already sent keep the timer they had. Everyone here sees the change in the chat.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
