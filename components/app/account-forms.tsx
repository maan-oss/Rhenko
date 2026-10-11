"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { deactivateAccount, deleteAccount, type AccountState } from "@/actions/account"
import { changeHandle, updateBirthday, type ProfileState } from "@/actions/social"
import { ErrorLine, Field, FIELD_INPUT } from "@/components/app/form-bits"
import { DateField } from "@/components/app/date-field"
import { Button } from "@/components/ui/button"
import type { CodeNeed } from "@/lib/account-rules"

function Submit({ label, pendingLabel, danger = false }: { label: string; pendingLabel: string; danger?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant={danger ? "destructive" : "default"} className="h-10 rounded-lg px-5">
      {pending ? pendingLabel : label}
    </Button>
  )
}

// The two-factor code a sensitive change asks for. It only appears while two-factor sign-in is on.
export function CodeField({ need }: { need: CodeNeed }) {
  if (need === "none") return null
  return (
    <Field
      label={need === "app" ? "Two-factor code" : "Recovery code"}
      hint={
        need === "app"
          ? "The 6-digit code from your authenticator app, or one of your recovery codes."
          : "Codes from your authenticator app can't be checked right now, so use one of your recovery codes. Each works once."
      }
    >
      <input
        name="code"
        required
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        placeholder={need === "app" ? "123456 or abcd-efgh" : "abcd-efgh"}
        className={`${FIELD_INPUT} tracking-wider`}
      />
    </Field>
  )
}

export function PasswordField() {
  return (
    <Field label="Password">
      <input name="password" type="password" required autoComplete="current-password" className={FIELD_INPUT} />
    </Field>
  )
}

export function ChangeHandleForm({ handle }: { handle: string }) {
  const router = useRouter()
  const [state, action] = useActionState(
    async (prev: ProfileState, formData: FormData): Promise<ProfileState> => {
      const result = await changeHandle(prev, formData)
      if (result.ok) {
        toast.success("Handle updated.")
        router.refresh()
      }
      return result
    },
    {}
  )
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Handle" hint="3 to 15 letters, numbers or underscores. Your old handle stops working right away.">
        <input name="handle" required defaultValue={handle} minLength={3} maxLength={15} className={FIELD_INPUT} />
      </Field>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Save handle" pendingLabel="Saving" />
      </div>
    </form>
  )
}

export function BirthdayForm({ birthday }: { birthday: string | null }) {
  const router = useRouter()
  const [state, action] = useActionState(
    async (prev: ProfileState, formData: FormData): Promise<ProfileState> => {
      const result = await updateBirthday(prev, formData)
      if (result.ok) {
        toast.success("Date of birth saved.")
        router.refresh()
      }
      return result
    },
    {}
  )
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="account-birthday" className="text-sm font-semibold">
          Date of birth
        </label>
        <DateField id="account-birthday" name="birthday" defaultValue={birthday ?? ""} placeholder="Pick your birthday" />
        <span className="text-xs text-muted-foreground">Only you can see this.</span>
      </div>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Save date" pendingLabel="Saving" />
      </div>
    </form>
  )
}

// Fetches the archive, then hands it to the browser to save, so a refusal shows here as a message instead of
// replacing the page.
export function DataExportButton() {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const response = await fetch("/api/account-data", { cache: "no-store" })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        toast.error(body?.error ?? "Your data couldn't be prepared. Try again in a moment.")
        return
      }
      const blob = await response.blob()
      const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "rhenko-data.zip"
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      toast.success(`Your data is ready: ${name}`)
    } catch {
      toast.error("The download stopped. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Button type="button" variant="outline" disabled={busy} onClick={download} className="h-10 rounded-lg px-4 font-semibold">
        {busy ? "Preparing your file" : "Download your data"}
      </Button>
    </div>
  )
}

export function DeactivateForm({ codeNeed }: { codeNeed: CodeNeed }) {
  const [state, action] = useActionState(deactivateAccount, {} as AccountState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <PasswordField />
      <CodeField need={codeNeed} />
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Deactivate account" pendingLabel="Deactivating" danger />
      </div>
    </form>
  )
}

export function DeleteAccountForm({ handle, codeNeed }: { handle: string; codeNeed: CodeNeed }) {
  const [state, action] = useActionState(deleteAccount, {} as AccountState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <PasswordField />
      <CodeField need={codeNeed} />
      <Field label={`Type @${handle} to confirm`}>
        <input name="confirm" required autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={`@${handle}`} className={FIELD_INPUT} />
      </Field>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Delete account forever" pendingLabel="Deleting" danger />
      </div>
    </form>
  )
}
