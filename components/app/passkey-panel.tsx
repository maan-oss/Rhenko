"use client"

import { useState, useSyncExternalStore, useTransition } from "react"
import { useRouter } from "next/navigation"
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser"
import { KeyRound } from "lucide-react"
import { toast } from "sonner"
import {
  finishPasskeyRegistration,
  finishPasskeySecondStep,
  finishPasskeySignIn,
  removePasskey,
  startPasskeyRegistration,
  startPasskeySecondStep,
  startPasskeySignIn,
} from "@/actions/passkeys"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { RelativeTime } from "@/components/app/time-text"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MAX_PASSKEY_NAME } from "@/lib/rules"

export type PasskeyItem = { id: string; name: string; createdAt: number; lastUsedAt: number | null }

const noSubscribe = () => () => {}

// Browsers differ on passkeys, and the server can't tell which one is asking, so the check runs in the browser only.
function useWebAuthnSupport(): boolean {
  return useSyncExternalStore(noSubscribe, () => browserSupportsWebAuthn(), () => false)
}

// A cancelled prompt is not an error worth alarming anyone about.
function explain(error: unknown): string {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) {
    return "The key wasn't used. Try again when you're ready."
  }
  return "That key didn't work. Try again."
}

export function PasskeysPanel({ passkeys }: { passkeys: PasskeyItem[] }) {
  const router = useRouter()
  const supported = useWebAuthnSupport()
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()

  function add() {
    startTransition(async () => {
      const start = await startPasskeyRegistration()
      if (!start.ok) {
        toast.error(start.error)
        return
      }
      let response
      try {
        response = await startRegistration({ optionsJSON: start.options })
      } catch (error) {
        {
        toast.error(explain(error))
        return
      }
      }
      const done = await finishPasskeyRegistration(response, name)
      if (!done.ok) {
        toast.error(done.error)
        return
      }
      setName("")
      toast.success("Key added.")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        A passkey signs you in with your device&apos;s fingerprint, face or PIN, with no password. A security key works as the
        second step after your password.
      </p>
      {!supported ? (
        <p className="text-[15px] text-muted-foreground">This browser can&apos;t use passkeys or security keys.</p>
      ) : null}
      {passkeys.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border">
          {passkeys.map((key) => (
            <li key={key.id} className="flex items-center gap-3 py-3">
              <KeyRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{key.name}</p>
                <p className="text-sm text-muted-foreground">
                  Added <RelativeTime at={key.createdAt} />
                  {key.lastUsedAt ? (
                    <>
                      {" "}· Used <RelativeTime at={key.lastUsedAt} />
                    </>
                  ) : (
                    " · Not used yet"
                  )}
                </p>
              </div>
              <RemoveKeyButton id={key.id} name={key.name} onDone={() => router.refresh()} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted-foreground">No passkeys or security keys yet.</p>
      )}
      {supported ? (
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending) add()
          }}
        >
          <Input
            aria-label="Name for this key"
            placeholder="Name, like Laptop or Security key"
            maxLength={MAX_PASSKEY_NAME}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 rounded-lg sm:max-w-xs"
          />
          <Button type="submit" disabled={pending} className="h-10 rounded-lg px-5">
            {pending ? "Waiting for your key" : "Add a passkey or key"}
          </Button>
        </form>
      ) : null}
    </div>
  )
}

function RemoveKeyButton({ id, name, onDone }: { id: string; name: string; onDone: () => void }) {
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" aria-label={`Remove ${name}`} className="h-8 rounded-full px-3">
          Remove
        </Button>
      }
      title={`Remove ${name}?`}
      description="You can't sign in with it after this. Add it again any time."
      confirmLabel="Remove"
      action={() => removePasskey(id)}
      onDone={onDone}
    />
  )
}

// The sign-in button on the login page. A passkey names the account, so the handle and password are not needed.
export function PasskeyLoginButton() {
  const router = useRouter()
  const supported = useWebAuthnSupport()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (!supported) return null

  function signIn() {
    setError(null)
    startTransition(async () => {
      const start = await startPasskeySignIn()
      if (!start.ok) return setError(start.error)
      let response
      try {
        response = await startAuthentication({ optionsJSON: start.options })
      } catch (cause) {
        return setError(explain(cause))
      }
      const done = await finishPasskeySignIn(response)
      if (!done.ok) return setError(done.error)
      router.replace("/")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" onClick={signIn} disabled={pending} className="h-12 w-full rounded-full text-[15px] font-semibold">
        <KeyRound className="size-4" aria-hidden />
        {pending ? "Waiting for your key" : "Sign in with a passkey"}
      </Button>
      {error ? (
        <p role="alert" className="text-[13px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// The second step after a password for an account with two-factor on: a passkey or security key in place of a code.
export function SecurityKeyButton() {
  const router = useRouter()
  const supported = useWebAuthnSupport()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  if (!supported) return null

  function verify() {
    setError(null)
    startTransition(async () => {
      const start = await startPasskeySecondStep()
      if (!start.ok) return setError(start.error)
      let response
      try {
        response = await startAuthentication({ optionsJSON: start.options })
      } catch (cause) {
        return setError(explain(cause))
      }
      const done = await finishPasskeySecondStep(response)
      if (!done.ok) return setError(done.error)
      router.replace("/")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" onClick={verify} disabled={pending} className="h-12 w-full rounded-full text-[15px] font-semibold">
        <KeyRound className="size-4" aria-hidden />
        {pending ? "Waiting for your key" : "Use a passkey or security key"}
      </Button>
      {error ? (
        <p role="alert" className="text-[13px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
