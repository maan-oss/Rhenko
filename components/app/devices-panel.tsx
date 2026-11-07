"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { approveDeviceLink, removeDevice, type LinkedDevice } from "@/actions/e2ee"
import { LocalTime, RelativeTime } from "@/components/app/time-text"
import type { CopyableLink, PendingLink } from "@/lib/e2ee-link"
import { DeviceLinkRequired, linkThisBrowser, readyDevice, shareHistoryWithLink } from "@/lib/e2ee-client"
import { formatLinkCode } from "@/lib/e2ee-link-rules"

// The devices of the account, and what this browser is. A new browser is linked from a device already on the account: it shows a code,
// and the code is approved on a device that is linked already. Approving copies the account's message history to the new browser.
export function DevicesPanel({
  devices,
  pending,
  copyable,
  encrypted,
}: {
  devices: LinkedDevice[]
  pending: PendingLink[]
  copyable: CopyableLink[]
  encrypted: boolean
}) {
  if (!encrypted) {
    return <p className="text-[15px] text-muted-foreground">Encrypted chats are not turned on on this server.</p>
  }
  return (
    <div className="flex flex-col gap-6">
      <ThisBrowser />
      <Pending links={pending} />
      <CopyAgain links={copyable} />
      <Linked devices={devices} />
    </div>
  )
}

type Status = "checking" | "ready" | "needs-link" | "linking" | "failed"

function ThisBrowser() {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("checking")
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const cancelled = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    readyDevice()
      .then(() => {
        if (alive.current) setStatus("ready")
      })
      .catch((failure: unknown) => {
        if (!alive.current) return
        if (failure instanceof DeviceLinkRequired) {
          setStatus("needs-link")
        } else {
          setError(failure instanceof Error ? failure.message : "This browser can't set up encryption.")
          setStatus("failed")
        }
      })
  }, [])

  async function startLinking() {
    cancelled.current = false
    setError(null)
    setStatus("linking")
    try {
      const result = await linkThisBrowser(
        (next) => {
          if (alive.current) setCode(next)
        },
        () => alive.current && !cancelled.current
      )
      if (!alive.current) return
      setCode(null)
      if (result.ok) {
        setStatus("ready")
        toast.success("This browser is linked to your account.")
        router.refresh()
      } else {
        setError(result.error)
        setStatus("needs-link")
      }
    } catch {
      if (!alive.current) return
      setCode(null)
      setError("Couldn't start linking. Check your connection and try again.")
      setStatus("needs-link")
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">This browser</h2>
      {status === "checking" ? <p className="text-[15px] text-muted-foreground">Checking this browser…</p> : null}
      {status === "ready" ? (
        <p className="text-[15px]">This browser is linked, so it can read and send encrypted messages.</p>
      ) : null}
      {status === "needs-link" ? (
        <>
          <p className="text-[15px] text-muted-foreground">
            This browser isn&apos;t linked yet. Your account already has a device, so approve this browser from one of them.
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div>
            <button
              type="button"
              onClick={startLinking}
              className="tap-44 rounded-full bg-foreground px-4 py-2 font-semibold text-background"
            >
              Link this browser
            </button>
          </div>
        </>
      ) : null}
      {status === "linking" ? (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] text-muted-foreground">
            On a device you&apos;re signed in on, open this page and approve this code. Check that it matches.
          </p>
          <p aria-live="polite" className="font-mono text-4xl font-semibold tracking-[0.12em] tabular-nums">
            {code ? formatLinkCode(code) : "…"}
          </p>
          <div>
            <button
              type="button"
              onClick={() => {
                cancelled.current = true
              }}
              className="tap-44 rounded-full px-4 py-2 font-semibold transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {status === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function Pending({ links }: { links: PendingLink[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(0)

  async function approve(code: string) {
    setBusy(code)
    setCopied(0)
    try {
      const approved = await approveDeviceLink(code)
      if (!approved.ok) {
        toast.error(approved.error)
        return
      }
      const copy = await shareHistoryWithLink(code, setCopied)
      if (copy.ok) {
        toast.success(`Browser linked. ${copyReport(copy.count, copy.skipped)}`)
      } else {
        toast.error(`Browser linked, but its history wasn't copied: ${copy.error}. You can copy it again below.`)
      }
    } catch {
      toast.error("Couldn't approve that code. Check your connection and try again.")
    } finally {
      setBusy(null)
      router.refresh()
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Waiting for approval</h2>
      {links.length === 0 ? <p className="text-[15px] text-muted-foreground">No browser is waiting to be linked.</p> : null}
      <ul className="flex flex-col divide-y divide-border">
        {links.map((link) => (
          <li key={link.code} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-mono text-2xl font-semibold tracking-[0.12em] tabular-nums">{formatLinkCode(link.code)}</p>
              <p className="truncate text-sm text-muted-foreground">
                {link.label} · Asked <RelativeTime at={link.createdAt} />
              </p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => approve(link.code)}
              className="tap-44 rounded-full bg-foreground px-4 py-2 font-semibold text-background disabled:opacity-50"
            >
              {busy === link.code ? `Copying… ${copied}` : "Approve"}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Approve only a code you can see on the new browser. Approving copies your encrypted chat history to that browser.
      </p>
    </section>
  )
}

// What the person is told after a copy: how many messages reached the new browser, and how many this browser could not open to copy.
function copyReport(count: number, skipped: number): string {
  const copied = count === 0 ? "No new messages to copy." : `${count} ${count === 1 ? "message was" : "messages were"} copied to it.`
  if (skipped === 0) return copied
  return `${copied} ${skipped} ${skipped === 1 ? "message" : "messages"} couldn't be opened on this browser, so ${skipped === 1 ? "it" : "they"} can't be copied.`
}

// The links approved from this browser whose history copy can still run. A copy that stopped part way, or left messages out, is run again
// from here until the time shown. Keys already copied are not copied twice.
function CopyAgain({ links }: { links: CopyableLink[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(0)

  if (links.length === 0) return null

  async function copyAgain(code: string) {
    setBusy(code)
    setCopied(0)
    try {
      const copy = await shareHistoryWithLink(code, setCopied)
      if (copy.ok) {
        toast.success(copyReport(copy.count, copy.skipped))
      } else {
        toast.error(`The history wasn't copied: ${copy.error}`)
      }
    } catch {
      toast.error("Couldn't copy the history. Check your connection and try again.")
    } finally {
      setBusy(null)
      router.refresh()
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">History copies</h2>
      <p className="text-sm text-muted-foreground">
        A browser approved from this one can have its history copied again until the time shown.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {links.map((link) => (
          <li key={link.code} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">{link.label}</p>
              <p className="text-sm text-muted-foreground">
                Copy again before <LocalTime at={link.expiresAt} variant="clock" />
              </p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => copyAgain(link.code)}
              className="tap-44 rounded-full px-4 py-2 font-semibold transition-colors hover:bg-muted disabled:opacity-50"
            >
              {busy === link.code ? `Copying… ${copied}` : "Copy again"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Linked({ devices }: { devices: LinkedDevice[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function remove(id: string) {
    setBusy(id)
    try {
      const result = await removeDevice(id)
      if (result.ok) {
        toast.success("Browser removed. It can't read new messages.")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Linked browsers</h2>
      <ul className="flex flex-col divide-y divide-border">
        {devices.map((device) => (
          <li key={device.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold">
                {device.label}
                {device.current ? <span className="ml-2 text-sm font-normal text-muted-foreground">This browser</span> : null}
              </p>
              <p className="text-sm text-muted-foreground">
                Linked <RelativeTime at={device.createdAt} />
              </p>
            </div>
            {device.current ? null : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => remove(device.id)}
                className="tap-44 rounded-full px-4 py-2 font-semibold transition-colors hover:bg-muted disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
