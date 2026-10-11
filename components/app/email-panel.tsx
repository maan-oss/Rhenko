"use client"

import { useActionState, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { cancelEmailCode, confirmEmail, removeEmail, sendEmailCode, type EmailState } from "@/actions/account"
import { CodeField, PasswordField } from "@/components/app/account-forms"
import { ErrorLine, Field, FIELD_INPUT } from "@/components/app/form-bits"
import { Button } from "@/components/ui/button"
import { EMAIL_CODE_MINUTES, MAX_EMAIL, type CodeNeed } from "@/lib/account-rules"
import { cn } from "@/lib/utils"

type Props = {
  email: string | null
  verified: boolean
  // A code that is out and still valid, from an earlier visit.
  pending: { target: string; expiresAt: number } | null
  // False when this server can't send email.
  ready: boolean
  codeNeed: CodeNeed
}

function Submit({ label, pendingLabel, danger = false, outline = false }: { label: string; pendingLabel: string; danger?: boolean; outline?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      variant={danger ? "destructive" : outline ? "outline" : "default"}
      className="h-10 rounded-lg px-5"
    >
      {pending ? pendingLabel : label}
    </Button>
  )
}

// Add, verify, change or remove the account's email. A new address only replaces the old one once the code sent to
// it is confirmed, so a typo never costs a verified address.
export function EmailPanel({ email, verified, pending, ready, codeNeed }: Props) {
  const [sentTo, setSentTo] = useState<string | null>(pending?.target ?? null)
  const [mode, setMode] = useState<"view" | "change" | "remove">("view")
  const [draft, setDraft] = useState("")
  const [cancelling, startCancel] = useTransition()

  // Three forms send a code: one for a new address, one to verify the current address, and one to send again.
  // Each keeps its own result, so an error shows beside the form that caused it.
  async function send(prev: EmailState, formData: FormData): Promise<EmailState> {
    const result = await sendEmailCode(prev, formData)
    if (result.ok && result.sentTo) {
      setSentTo(result.sentTo)
      setMode("view")
      toast.success(`Code sent to ${result.sentTo}.`)
    }
    return result
  }
  const [changeState, changeAction] = useActionState(send, {})
  const [verifyState, verifyAction] = useActionState(send, {})
  const [resendState, resendAction] = useActionState(send, {})

  const [confirmState, confirmAction] = useActionState(async (prev: EmailState, formData: FormData): Promise<EmailState> => {
    const result = await confirmEmail(prev, formData)
    if (result.ok) {
      setSentTo(null)
      setDraft("")
      toast.success(`${result.email ?? "Your email"} is verified.`)
    }
    return result
  }, {})

  const [removeState, removeAction] = useActionState(async (prev: EmailState, formData: FormData): Promise<EmailState> => {
    const result = await removeEmail(prev, formData)
    if (result.ok) {
      setMode("view")
      setSentTo(null)
      toast.success("Email removed.")
    }
    return result
  }, {})

  function cancel() {
    startCancel(async () => {
      const result = await cancelEmailCode()
      if (!result.ok) toast.error(result.error)
      else setSentTo(null)
    })
  }

  const adding = !email
  // A code is out and this server can still check it, so the panel asks for the code.
  const waiting = ready && sentTo !== null
  const showChangeForm = ready && !waiting && (adding || mode === "change")

  return (
    <div className="flex flex-col gap-4">
      {email ? (
        <div className="flex flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 text-[15px] font-semibold break-all">{email}</span>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold",
                verified ? "border-border text-foreground" : "border-destructive/40 text-destructive"
              )}
            >
              {verified ? "Verified" : "Not verified"}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {verified
              ? "You can use it to reset your password if you forget it."
              : "Verify it to use it for password resets. Only you can see it."}
          </p>
        </div>
      ) : (
        <p className="text-[15px] text-muted-foreground">
          No email yet. Add one and verify it, and you can reset your password by email. Only you can see it.
        </p>
      )}

      {ready ? null : (
        <p role="status" className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm">
          Email isn&apos;t set up on this server, so codes can&apos;t be sent and addresses can&apos;t be added or verified
          here.{email ? " You can still remove the address below." : ""}
        </p>
      )}

      {waiting && sentTo ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <p className="text-[15px]">
            We sent a 6-digit code to <span className="font-semibold break-all">{sentTo}</span>. It works for{" "}
            {EMAIL_CODE_MINUTES} minutes.
          </p>
          <form action={confirmAction} className="flex flex-col gap-3">
            <Field label="Code from the email">
              <input
                name="code"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={7}
                placeholder="123456"
                className={`${FIELD_INPUT} tracking-wider`}
              />
            </Field>
            <ErrorLine message={confirmState.error} />
            <div className="flex justify-end">
              <Submit label="Confirm" pendingLabel="Checking" />
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <form action={resendAction}>
              <input type="hidden" name="email" value={sentTo} />
              <Submit label="Send a new code" pendingLabel="Sending" outline />
            </form>
            <Button type="button" variant="ghost" disabled={cancelling} onClick={cancel} className="h-10 rounded-lg px-4">
              Use a different email
            </Button>
          </div>
          <ErrorLine message={resendState.error} />
        </div>
      ) : null}

      {ready && !waiting && email && !verified && mode === "view" ? (
        <form action={verifyAction} className="flex flex-col gap-2">
          <input type="hidden" name="email" value={email} />
          <div>
            <Submit label="Send a code to verify it" pendingLabel="Sending" />
          </div>
          <ErrorLine message={verifyState.error} />
        </form>
      ) : null}

      {showChangeForm ? (
        <form action={changeAction} className="flex flex-col gap-3">
          <Field label={adding ? "Email" : "New email"} hint="We'll send a code to it. Your current email stays until you confirm the code.">
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              maxLength={MAX_EMAIL}
              placeholder="name@example.com"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className={FIELD_INPUT}
            />
          </Field>
          <PasswordField />
          <CodeField need={codeNeed} />
          <ErrorLine message={changeState.error} />
          <div className="flex justify-end gap-2">
            {adding ? null : (
              <Button type="button" variant="ghost" onClick={() => setMode("view")} className="h-10 rounded-lg px-4">
                Cancel
              </Button>
            )}
            <Submit label="Send code" pendingLabel="Sending" />
          </div>
        </form>
      ) : null}

      {email && mode === "remove" ? (
        <form action={removeAction} className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <p className="text-[15px]">
            Without an email, you can&apos;t reset your password if you forget it.
          </p>
          <PasswordField />
          <CodeField need={codeNeed} />
          <ErrorLine message={removeState.error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMode("view")} className="h-10 rounded-lg px-4">
              Cancel
            </Button>
            <Submit label="Remove email" pendingLabel="Removing" danger />
          </div>
        </form>
      ) : null}

      {email && mode === "view" && !waiting ? (
        <div className="flex flex-wrap gap-2">
          {ready ? (
            <Button type="button" variant="outline" onClick={() => setMode("change")} className="h-9 rounded-full px-4">
              Change email
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setMode("remove")} className="h-9 rounded-full px-4">
            Remove email
          </Button>
        </div>
      ) : null}
    </div>
  )
}
