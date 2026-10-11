"use client"

import { useActionState, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  beginTotpSetup,
  changePassword,
  disableTotp,
  enableTotp,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  revokeSession,
  type AccountState,
  type CodesResult,
} from "@/actions/account"
import { ErrorLine, Field, FIELD_INPUT } from "@/components/app/form-bits"
import { Button } from "@/components/ui/button"

function Submit({ label, pendingLabel, danger = false }: { label: string; pendingLabel: string; danger?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant={danger ? "destructive" : "default"} className="h-10 rounded-lg px-5">
      {pending ? pendingLabel : label}
    </Button>
  )
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(
    async (prev: AccountState, formData: FormData): Promise<AccountState> => {
      const result = await changePassword(prev, formData)
      if (result.ok) toast.success("Password changed. Other devices were signed out.")
      return result
    },
    {}
  )
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Current password">
        <input name="current" type="password" required autoComplete="current-password" className={FIELD_INPUT} />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <input name="next" type="password" required minLength={8} autoComplete="new-password" className={FIELD_INPUT} />
      </Field>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Change password" pendingLabel="Saving" />
      </div>
    </form>
  )
}

function CodeList({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <p className="font-semibold">Save these recovery codes</p>
      <p className="text-sm text-muted-foreground">Each code works once if you lose your authenticator. They won&apos;t be shown again.</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-[15px] tabular-nums">
        {codes.map((code) => (
          <li key={code} className="rounded-md bg-muted px-2 py-1.5">
            {code}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Turn two-factor sign-in on with an authenticator app, or manage it once it is on.
export function TwoFactorPanel({ enabled, codesLeft }: { enabled: boolean; codesLeft: number }) {
  const router = useRouter()
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()

  const [, enableAction] = useActionState(
    async (_prev: CodesResult | null, formData: FormData): Promise<CodesResult | null> => {
      const result = await enableTotp({}, formData)
      if (result.ok) {
        setCodes(result.codes)
        setSetup(null)
        setError(undefined)
        toast.success("Two-factor sign-in is on.")
        router.refresh()
      } else setError(result.error)
      return result
    },
    null
  )

  const [disableState, disableAction] = useActionState(
    async (prev: AccountState, formData: FormData): Promise<AccountState> => {
      const result = await disableTotp(prev, formData)
      if (result.ok) {
        toast.success("Two-factor sign-in is off.")
        router.refresh()
      }
      return result
    },
    {}
  )

  const [regenState, regenAction] = useActionState(
    async (_prev: CodesResult | null, formData: FormData): Promise<CodesResult | null> => {
      const result = await regenerateRecoveryCodes({}, formData)
      if (result.ok) {
        setCodes(result.codes)
        router.refresh()
      }
      return result
    },
    null
  )

  function begin() {
    startTransition(async () => {
      const result = await beginTotpSetup()
      if (!result.ok) toast.error(result.error)
      else setSetup({ qr: result.qr, secret: result.secret })
    })
  }

  if (!enabled && !setup && !codes) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-muted-foreground">
          Ask for a six-digit code from an authenticator app each time you sign in on a new device.
        </p>
        <div>
          <Button type="button" disabled={pending} onClick={begin} className="h-10 rounded-lg px-5">
            Turn on two-factor sign-in
          </Button>
        </div>
      </div>
    )
  }

  if (!enabled && setup) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px]">Scan this code with your authenticator app, then enter the six-digit code it shows.</p>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {/* The QR image is generated on the server as a data URL. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={176} height={176} className="rounded-lg border border-border bg-white p-2" />
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-semibold">Can&apos;t scan it?</span>
            <span className="text-muted-foreground">Enter this key instead:</span>
            <code className="break-all rounded-md bg-muted px-2 py-1 font-mono">{setup.secret}</code>
          </div>
        </div>
        <form action={enableAction} className="flex flex-col gap-3">
          <Field label="Six-digit code">
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={FIELD_INPUT} />
          </Field>
          <ErrorLine message={error} />
          <div className="flex justify-end">
            <Submit label="Turn on" pendingLabel="Checking" />
          </div>
        </form>
      </div>
    )
  }

  if (codes) {
    return (
      <div className="flex flex-col gap-4">
        <CodeList codes={codes} />
        <div className="flex justify-end">
          <Button type="button" onClick={() => setCodes(null)} className="h-10 rounded-lg px-5">
            Done
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px]">
        Two-factor sign-in is on. You have <span className="font-semibold">{codesLeft}</span> unused recovery {codesLeft === 1 ? "code" : "codes"} left.
      </p>
      <form action={regenAction} className="flex flex-col gap-3">
        <p className="font-semibold">Get new recovery codes</p>
        <p className="text-sm text-muted-foreground">This replaces your unused codes.</p>
        <Field label="Password">
          <input name="password" type="password" required autoComplete="current-password" className={FIELD_INPUT} />
        </Field>
        <ErrorLine message={regenState && !regenState.ok ? regenState.error : undefined} />
        <div className="flex justify-end">
          <Submit label="Get new codes" pendingLabel="Saving" />
        </div>
      </form>
      <form action={disableAction} className="flex flex-col gap-3 border-t border-border pt-6">
        <p className="font-semibold">Turn off two-factor sign-in</p>
        <Field label="Password">
          <input name="password" type="password" required autoComplete="current-password" className={FIELD_INPUT} />
        </Field>
        <Field label="Current code">
          <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={11} className={FIELD_INPUT} />
        </Field>
        <ErrorLine message={disableState.error} />
        <div className="flex justify-end">
          <Submit label="Turn off" pendingLabel="Turning off" danger />
        </div>
      </form>
    </div>
  )
}

export function RevokeSessionButton({ tokenHash, current }: { tokenHash: string; current: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (current) return <span className="text-sm font-semibold text-dusk">This device</span>
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      className="h-8 rounded-full px-3"
      onClick={() =>
        startTransition(async () => {
          const result = await revokeSession(tokenHash)
          if (!result.ok) toast.error(result.error)
          else router.refresh()
        })
      }
    >
      Sign out
    </Button>
  )
}

export function RevokeOthersButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      className="h-10 rounded-lg px-4"
      onClick={() =>
        startTransition(async () => {
          const result = await revokeOtherSessions()
          if (!result.ok) toast.error(result.error)
          else {
            toast.success("Signed out of other devices.")
            router.refresh()
          }
        })
      }
    >
      Sign out other devices
    </Button>
  )
}
