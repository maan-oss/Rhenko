"use client"

import { useRef, useState, useSyncExternalStore, useTransition } from "react"
import Link from "@/components/app/link"
import { toast } from "sonner"
import { setEmailDigest } from "@/actions/digest"
import { PreviewChoice } from "@/components/app/push-settings"
import { RelativeTime } from "@/components/app/time-text"
import { DIGEST_NOT_SET_UP, hourLabel } from "@/lib/digest-rules"
import { cn } from "@/lib/utils"

type Props = {
  // Why the switch can't be turned on, or "ready".
  state: "ready" | "no-email" | "unverified" | "unavailable"
  address: string | null
  enabled: boolean
  // True once the person has turned the digest on before, so their hour is theirs and not a default.
  chosen: boolean
  hour: number
  lastSentAt: number | null
  previews: boolean
  // Push is not set up on this server, so its "Show message previews" switch isn't on the page. It is shown here instead.
  previewsHere: boolean
}

const LINK = "font-semibold text-foreground underline underline-offset-4"

function noSubscribe() {
  return () => {}
}

// What each UTC hour is on this device's clock, today. The server can't know the reader's time zone, so it renders nothing
// here and the labels appear after hydration.
function localHours(): string {
  const now = new Date()
  const labels: string[] = []
  for (let hour = 0; hour < 24; hour++) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour))
    labels.push(at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))
  }
  return labels.join("|")
}

// The UTC hour that is 8 in the morning on this device, for the first time the digest is turned on.
function morningHere(): number {
  const at = new Date()
  at.setHours(8, 0, 0, 0)
  return at.getUTCHours()
}

// The daily email digest: a switch, and the hour it goes out. Rhenko stores no time zone for anyone, so the hour is a UTC
// hour, with this device's clock shown beside it. The digest only goes to a confirmed address.
export function DigestSettings({ state, address, enabled, chosen, hour, lastSentAt, previews, previewsHere }: Props) {
  const [on, setOn] = useState(enabled && state === "ready")
  const [sendHour, setSendHour] = useState(hour)
  const [pending, startTransition] = useTransition()
  // Set once the person picks an hour themselves, so the suggestion from their clock never overrides it.
  const touched = useRef(false)
  const local = useSyncExternalStore(noSubscribe, localHours, () => "").split("|")

  function save(nextOn: boolean, nextHour: number, done: string, revert: () => void) {
    startTransition(async () => {
      const result = await setEmailDigest(nextOn, nextHour)
      if (!result.ok) {
        revert()
        toast.error(result.error)
        return
      }
      toast.success(done)
    })
  }

  function toggle() {
    const next = !on
    // The first time, the hour suggested is 8 in the morning where this device is, so it isn't 1 in the afternoon for anyone.
    const nextHour = next && !chosen && !touched.current ? morningHere() : sendHour
    setOn(next)
    setSendHour(nextHour)
    save(next, nextHour, next ? `Daily digest is on. It goes out at ${hourLabel(nextHour)}.` : "Daily digest is off.", () => {
      setOn(!next)
      setSendHour(sendHour)
    })
  }

  function pick(value: string) {
    const nextHour = Number(value)
    const before = sendHour
    touched.current = true
    setSendHour(nextHour)
    save(true, nextHour, `The digest will go out at ${hourLabel(nextHour)}.`, () => setSendHour(before))
  }

  const ready = state === "ready"
  const noteId = "digest-switch-note"
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id="digest-switch-label" className="text-[15px] font-semibold">
            Email me a daily digest
          </span>
          <span id={noteId} className="text-sm text-muted-foreground">
            {state === "unavailable" ? (
              DIGEST_NOT_SET_UP
            ) : state === "no-email" ? (
              <>
                You need a confirmed email address.{" "}
                <Link href="/settings/account" className={LINK}>
                  Add one in Settings → Account
                </Link>
                .
              </>
            ) : state === "unverified" ? (
              <>
                Your email address isn&apos;t confirmed yet.{" "}
                <Link href="/settings/account" className={LINK}>
                  Confirm it in Settings → Account
                </Link>
                .
              </>
            ) : (
              <>
                One email a day with how many likes, replies and messages you missed, and the five newest. It goes to{" "}
                <span className="text-foreground">{address}</span>, and only when there is something new.
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="digest-switch-label"
          aria-describedby={noteId}
          disabled={pending || !ready}
          onClick={toggle}
          className={cn(
            "tap-44 relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60",
            on ? "border-dusk bg-dusk" : "border-border bg-muted"
          )}
        >
          <span className={cn("size-5 rounded-full bg-background shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-[3px]")} />
        </button>
      </div>

      {ready && on ? (
        <div className="settle flex flex-col gap-3 rounded-lg border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5">
            <label htmlFor="digest-hour" className="text-[15px] font-semibold">
              Send it at
            </label>
            <span id="digest-hour-note" className="text-sm text-muted-foreground">
              Rhenko doesn&apos;t store your time zone, so the hour is in UTC. Beside each hour is the time on this device&apos;s clock.
              {lastSentAt ? (
                <>
                  {" "}
                  Last sent <RelativeTime at={lastSentAt} />.
                </>
              ) : null}
            </span>
          </div>
          <select
            id="digest-hour"
            value={sendHour}
            disabled={pending}
            aria-describedby="digest-hour-note"
            onChange={(event) => pick(event.target.value)}
            className="h-10 w-full shrink-0 rounded-lg border border-border bg-background px-3 text-[15px] outline-none transition-colors focus:border-foreground disabled:opacity-60 sm:w-auto"
          >
            {Array.from({ length: 24 }, (_, value) => (
              <option key={value} value={value}>
                {local[value] ? `${hourLabel(value)} (${local[value]} here)` : hourLabel(value)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {previewsHere ? (
        <PreviewChoice initial={previews} hint="The digest shows a message's first words. When this is off, it says only who sent it." />
      ) : null}
    </div>
  )
}
