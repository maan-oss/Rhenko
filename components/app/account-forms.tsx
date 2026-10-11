"use client"

import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { deactivateAccount, deleteAccount, type AccountState } from "@/actions/account"
import { changeHandle, updateBirthday, type ProfileState } from "@/actions/social"
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
      <Field label="Date of birth" hint="Only you can see this.">
        <input name="birthday" type="date" required defaultValue={birthday ?? ""} className={FIELD_INPUT} />
      </Field>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Save date" pendingLabel="Saving" />
      </div>
    </form>
  )
}

export function DeactivateForm() {
  const [state, action] = useActionState(deactivateAccount, {} as AccountState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" className={FIELD_INPUT} />
      </Field>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Deactivate account" pendingLabel="Deactivating" danger />
      </div>
    </form>
  )
}

export function DeleteAccountForm({ handle }: { handle: string }) {
  const [state, action] = useActionState(deleteAccount, {} as AccountState)
  useEffect(() => {
    if (state.error) toast.error(state.error)
  }, [state.error])
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" className={FIELD_INPUT} />
      </Field>
      <Field label={`Type @${handle} to confirm`}>
        <input name="confirm" required autoComplete="off" placeholder={`@${handle}`} className={FIELD_INPUT} />
      </Field>
      <ErrorLine message={state.error} />
      <div className="flex justify-end">
        <Submit label="Delete account forever" pendingLabel="Deleting" danger />
      </div>
    </form>
  )
}
