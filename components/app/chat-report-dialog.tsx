"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { chatReportKey, reportChatMessage } from "@/actions/chat-reports"
import { toggleBlock } from "@/actions/social"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import type { ReportPublicKey } from "@/lib/chat-reports"
import { sealLocalReport } from "@/lib/chat-report-client"
import type { MessageView } from "@/lib/data"
import { REPORT_REASONS, URGENT_REPORT } from "@/lib/rules"
import { cn } from "@/lib/utils"

// Reports one message of a chat, the way WhatsApp does: the message and the ones before it go to Rhenko, and nobody else in the chat
// is told. In an encrypted chat this device seals the report from what it has opened. Blocking the sender is offered only in a direct
// chat, and it is a separate choice from the report.
export function ChatReportDialog({
  open,
  onOpenChange,
  conversationId,
  encrypted,
  messages,
  messageId,
  canBlock,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  encrypted: boolean
  messages: MessageView[]
  messageId: string
  canBlock: boolean
}) {
  const [reason, setReason] = useState<string>(REPORT_REASONS[0])
  const [block, setBlock] = useState(false)
  const [sending, startSending] = useTransition()
  const handle = messages.find((message) => message.id === messageId)?.senderHandle ?? ""

  function submit() {
    startSending(async () => {
      const key = await chatReportKey()
      if (!key) {
        toast.error("Reporting isn't available right now. Try again later.")
        return
      }
      const result = await send({ kid: key.kid, jwk: key.jwk })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (block && canBlock && handle) {
        const blocked = await toggleBlock(handle, true)
        if (!blocked.ok) toast.error(blocked.error)
      }
      toast.success(URGENT_REPORT[reason] ? "Report sent. The message has been taken off the chat while we review it." : "Report sent.")
      onOpenChange(false)
    })
  }

  // An encrypted chat is sealed on this device; any other chat is sealed by the server from what it stores.
  async function send(key: ReportPublicKey): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!encrypted) return reportChatMessage({ conversationId, messageId, reason })
    const sealed = await sealLocalReport({ conversationId, messages, messageId, reason, key })
    if (!sealed.ok) return sealed
    return reportChatMessage({ conversationId, messageId, reason, sealed: sealed.sealed })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-sm", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
        <DialogTitle className="text-lg font-semibold">Report message</DialogTitle>
        {/* The wording below is awaiting counsel's approval (docs/lawyer-review.md). Change it only with counsel. */}
        <DialogDescription className="text-sm text-muted-foreground">
          Why are you reporting this message? The message and up to four before it go to Rhenko for review. Nobody else in the chat is
          told. Rhenko keeps the report for one year, and passes it on only where the law requires.
        </DialogDescription>
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">Reason</legend>
          {REPORT_REASONS.map((option) => (
            <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] hover:bg-muted">
              <input
                type="radio"
                name={`chat-report-${messageId}`}
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
                className="size-4 accent-[var(--dusk)]"
              />
              {option}
            </label>
          ))}
        </fieldset>
        {canBlock && handle ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-[15px] hover:bg-muted">
            <input
              type="checkbox"
              checked={block}
              onChange={(event) => setBlock(event.target.checked)}
              className="size-4 accent-[var(--dusk)]"
            />
            Also block @{handle}
          </label>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-10 rounded-full px-4 sm:h-9">
            Cancel
          </Button>
          <Button type="button" disabled={sending} onClick={submit} className="h-10 rounded-full px-4 font-semibold sm:h-9">
            {sending ? "Sending" : "Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
