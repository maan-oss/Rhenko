"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { setNotificationPref } from "@/actions/account"
import { ToggleSwitch } from "@/components/app/toggle-switch"

type Row = { kind: string; title: string; hint: string; enabled: boolean }

// Each kind of notification can be turned off. Turning one off stops new ones of that kind from arriving.
export function NotificationPrefs({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map((row) => (
        <PrefRow key={row.kind} row={row} />
      ))}
    </ul>
  )
}

function PrefRow({ row }: { row: Row }) {
  const [on, setOn] = useState(row.enabled)
  const [pending, startTransition] = useTransition()
  const hintId = `notification-pref-${row.kind}`
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="font-semibold">{row.title}</p>
        <p id={hintId} className="text-sm text-muted-foreground">
          {row.hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={row.title}
        aria-describedby={hintId}
        disabled={pending}
        onClick={() => {
          const next = !on
          setOn(next)
          startTransition(async () => {
            const result = await setNotificationPref(row.kind, next)
            if (!result.ok) {
              setOn(!next)
              toast.error(result.error)
            } else {
              toast.success(`${row.title}: ${next ? "on" : "off"}`)
            }
          })
        }}
        className="tap-44 inline-flex shrink-0 items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ToggleSwitch on={on} />
      </button>
    </li>
  )
}
