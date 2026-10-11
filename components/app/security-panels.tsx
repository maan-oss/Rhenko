"use client"

import { useActionState, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
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
import { CodeField, PasswordField } from "@/components/app/account-forms"
import { ErrorLine, Field, FIELD_INPUT } from "@/components/app/form-bits"
import { Button } from "@/components/ui/button"
import { PASSWORD_RULE } from "@/lib/account-rules"
import { MAX_PASSWORD, MIN_PASSWORD } from "@/lib/rules"

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
      <Field label="New password" hint={PASSWORD_RULE}>
        <input
          name="next"
          type="password"
          required
          minLength={MIN_PASSWORD}
          maxLength={MAX_PASSWORD}
          autoComplete="new-password"
          className={FIELD_INPUT}
        />
      </Field>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Change password" pendingLabel="Saving" />
      </div>
    </form>
  )
}

function CodeList({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"))
      toast.success("Recovery codes copied.")
    } catch {
      toast.error("Couldn't copy them. Select the codes and copy them yourself.")
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <p className="font-semibold">Save these recovery codes</p>
        <p className="text-sm text-muted-foreground">
          Each code works once, for signing in or for changes that ask for a code, if you can&apos;t use your
          authenticator app. They won&apos;t be shown again.
        </p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-[15px] tabular-nums">
          {codes.map((code) => (
            <li key={code} className="rounded-md bg-muted px-2 py-1.5">
              {code}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={copy} className="h-10 rounded-lg px-4">
          Copy codes
        </Button>
        <Button type="button" onClick={onDone} className="h-10 rounded-lg px-5">
          I saved them
        </Button>
      </div>
    </div>
  )
}

// Turn two-factor sign-in on with an authenticator app, or manage it once it is on. `usable` is false when this
// server can't read the stored authenticator key; then only recovery codes work.
export function TwoFactorPanel({ enabled, usable, codesLeft }: { enabled: boolean; usable: boolean; codesLeft: number }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [starting, startSetup] = useTransition()

  const [enableState, enableAction] = useActionState(
    async (_prev: CodesResult | null, formData: FormData): Promise<CodesResult | null> => {
      const result = await enableTotp({}, formData)
      if (result.ok) {
        setCodes(result.codes)
        setSetup(null)
        toast.success("Two-factor sign-in is on.")
      }
      return result
    },
    null
  )

  const [disableState, disableAction] = useActionState(
    async (prev: AccountState, formData: FormData): Promise<AccountState> => {
      const result = await disableTotp(prev, formData)
      if (result.ok) toast.success("Two-factor sign-in is off.")
      return result
    },
    {}
  )

  const [regenState, regenAction] = useActionState(
    async (_prev: CodesResult | null, formData: FormData): Promise<CodesResult | null> => {
      const result = await regenerateRecoveryCodes({}, formData)
      if (result.ok) {
        setCodes(result.codes)
        toast.success("New recovery codes are ready. The old ones no longer work.")
      }
      return result
    },
    null
  )

  function begin() {
    startSetup(async () => {
      const result = await beginTotpSetup()
      if (!result.ok) toast.error(result.error)
      else setSetup({ qr: result.qr, secret: result.secret })
    })
  }

  if (codes) return <CodeList codes={codes} onDone={() => setCodes(null)} />

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
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} className={`${FIELD_INPUT} tracking-wider`} />
          </Field>
          <ErrorLine message={enableState && !enableState.ok ? enableState.error : undefined} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setSetup(null)} className="h-10 rounded-lg px-4">
              Cancel
            </Button>
            <Submit label="Turn on" pendingLabel="Checking" />
          </div>
        </form>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[15px] text-muted-foreground">
          Ask for a six-digit code from an authenticator app each time you log in, and before big changes to your
          account.
        </p>
        <div>
          <Button type="button" disabled={starting} onClick={begin} className="h-10 rounded-lg px-5">
            {starting ? "Starting" : "Turn on two-factor sign-in"}
          </Button>
        </div>
      </div>
    )
  }

  // No app code can be checked and no recovery code is left, so the password alone turns two-factor sign-in off.
  const stuck = !usable && codesLeft === 0
  const need = usable ? "app" : "recovery"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-[15px]">
          Two-factor sign-in is on. You have <span className="font-semibold">{codesLeft}</span> unused recovery{" "}
          {codesLeft === 1 ? "code" : "codes"} left.
          {usable && codesLeft <= 2 ? " Get new ones before you run out." : ""}
        </p>
        {usable ? null : (
          <p role="status" className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm">
            This server can&apos;t read your authenticator key, so codes from your app don&apos;t work and two-factor sign-in
            with the app is unavailable.{" "}
            {stuck
              ? "You have no recovery codes left, so you can turn two-factor sign-in off with your password, then turn it on again with a new key."
              : "Log in and confirm changes with recovery codes, or turn two-factor sign-in off and on again to set up a new key."}
          </p>
        )}
      </div>
      {stuck ? null : (
        <form action={regenAction} className="flex flex-col gap-3">
          <p className="font-semibold">Get new recovery codes</p>
          <p className="text-sm text-muted-foreground">This replaces every unused code.</p>
          <PasswordField />
          <CodeField need={need} />
          <ErrorLine message={regenState && !regenState.ok ? regenState.error : undefined} />
          <div className="flex justify-end">
            <Submit label="Get new codes" pendingLabel="Saving" />
          </div>
        </form>
      )}
      <form action={disableAction} className="flex flex-col gap-3 border-t border-border pt-6">
        <p className="font-semibold">Turn off two-factor sign-in</p>
        <PasswordField />
        {stuck ? null : <CodeField need={need} />}
        <ErrorLine message={disableState.error} />
        <div className="flex justify-end">
          <Submit label="Turn off" pendingLabel="Turning off" danger />
        </div>
      </form>
    </div>
  )
}

export function RevokeSessionButton({ tokenHash, current }: { tokenHash: string; current: boolean }) {
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
          else toast.success("That device is signed out.")
        })
      }
    >
      Sign out
    </Button>
  )
}

export function RevokeOthersButton() {
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
          else toast.success("Signed out of other devices.")
        })
      }
    >
      Sign out other devices
    </Button>
  )
}
