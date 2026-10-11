"use client"

import { Phone } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

// Calls need a signalling server that this build does not run yet, so the button says so
// instead of starting a call that cannot connect.
export function CallButton({ name }: { name: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={`Call ${name}`}
      title="Calls"
      className="rounded-full"
      onClick={() => toast("Calls aren't live yet. Messages still arrive right away.")}
    >
      <Phone className="size-4" />
    </Button>
  )
}
