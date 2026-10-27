"use client"

import { useEffect, useState } from "react"
import { CheckCheck } from "lucide-react"
import { messageInfo, type MessageInfoResult } from "@/actions/messages"
import { Avatar } from "@/components/app/avatar"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { LocalTime } from "@/components/app/time-text"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

// Who has seen one of your messages. A person has seen it once they last read the chat at or after it was sent.
export function MessageInfoDialog({ messageId, onOpenChange }: { messageId: string; onOpenChange: (open: boolean) => void }) {
  const [info, setInfo] = useState<MessageInfoResult | null>(null)

  useEffect(() => {
    let current = true
    messageInfo(messageId)
      .then((result) => {
        if (current) setInfo(result)
      })
      .catch(() => {
        if (current) setInfo({ ok: false, error: "Couldn't load this right now. Try again." })
      })
    return () => {
      current = false
    }
  }, [messageId])

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
        <DialogTitle>Message info</DialogTitle>
        {info === null ? (
          <DialogDescription>Loading…</DialogDescription>
        ) : !info.ok ? (
          <DialogDescription role="alert" className="text-destructive">
            {info.error}
          </DialogDescription>
        ) : (
          <>
            <DialogDescription>
              Sent <LocalTime at={info.sentAt} variant="full" />
            </DialogDescription>
            {info.people.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No one else is in this chat now.</p>
            ) : (
              <ul className="mt-4 flex max-h-[55dvh] list-none flex-col gap-1 overflow-y-auto">
                {info.people.map((person) => (
                  <li key={person.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <Avatar user={person} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{person.name}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">@{person.handle}</span>
                    </span>
                    {person.seen ? (
                      <span className="flex items-center gap-1 text-[13px] font-medium text-foreground">
                        <CheckCheck className="size-4" aria-hidden="true" />
                        Seen
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">Not seen yet</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
