"use client"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function SubmitToastButton() {
  return (
    <Button
      variant="secondary"
      onClick={() => toast("Saved in this preview only.")}
    >
      Show toast
    </Button>
  )
}
