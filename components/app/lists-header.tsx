"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { CreateListForm } from "@/components/app/list-controls"
import { PageHeader } from "@/components/app/page-header"
import { Button } from "@/components/ui/button"

// The Lists title, with New list beside it, as X keeps its create action in the header. The form opens under the header
// on request, so the page starts with the lists themselves.
export function ListsHeader() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <PageHeader
        title="Lists"
        actions={
          <Button
            type="button"
            variant="secondary"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="h-9 shrink-0 rounded-full px-4 text-[15px] font-semibold"
          >
            {open ? null : <Plus className="size-4" aria-hidden="true" />}
            {open ? "Cancel" : "New list"}
          </Button>
        }
      />
      {open ? <CreateListForm /> : null}
    </>
  )
}
