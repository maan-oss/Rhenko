"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ProofCheck } from "@/components/app/proof-check"

// A check asked for in the middle of an action: following, starting a conversation or posting, once an account has been
// doing a lot. The action is sent again with the answer as soon as the check passes.
export function ProofDialog({
  open,
  onOpenChange,
  onProof,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onProof: (proof: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(92vw,380px)] gap-4 p-5" showCloseButton>
        <DialogTitle className="text-lg font-semibold">One quick check</DialogTitle>
        <DialogDescription className="text-sm leading-snug text-muted-foreground">
          This account has been busy. This check keeps Rhenko for people. Your action goes through once it passes.
        </DialogDescription>
        {open ? <ProofCheck onReady={(proof) => proof && onProof(proof)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

// Holds the action to send again. `askForProof` opens the check; when it passes, `retry` runs with the answer.
export function useProofGate() {
  const [pending, setPending] = useState<{ retry: (proof: string) => void } | null>(null)
  const dialog = (
    <ProofDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
      onProof={(proof) => {
        const next = pending
        setPending(null)
        next?.retry(proof)
      }}
    />
  )
  return {
    askForProof: (retry: (proof: string) => void) => setPending({ retry }),
    dialog,
  }
}
