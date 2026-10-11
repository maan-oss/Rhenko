"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { startConversation } from "@/actions/messages"
import { sendMessage } from "@/actions/messages"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

// Sends a post to one person in a direct message. Opens the conversation afterwards.
export function ShareDialog({ open, onOpenChange, postId }: { open: boolean; onOpenChange: (open: boolean) => void; postId: string }) {
  const router = useRouter()
  const [handle, setHandle] = useState("")
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const clean = handle.trim().replace(/^@/, "")
    if (!clean) return
    startTransition(async () => {
      const started = await startConversation(clean)
      if (!started.ok) {
        toast.error(started.error)
        return
      }
      const body = new FormData()
      body.set("conversationId", started.id)
      body.set("postId", postId)
      const sent = await sendMessage({}, body)
      if (sent.error) {
        toast.error(sent.error)
        return
      }
      toast.success(`Sent to @${clean}.`)
      onOpenChange(false)
      setHandle("")
      router.push(`/messages/${started.id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" showCloseButton>
        <DialogTitle className="text-lg font-semibold">Send post</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          Send this post to someone in a direct message. New chats with people you don&apos;t follow go to their message requests.
        </DialogDescription>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold">Handle</span>
            <Input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@handle" autoComplete="off" className="h-10" />
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || handle.trim() === ""} className="h-9 rounded-full px-5 font-semibold">
              {pending ? "Sending" : "Send"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
