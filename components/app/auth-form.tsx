"use client"

import { useActionState, type InputHTMLAttributes } from "react"
import { useFormStatus } from "react-dom"
import { login, signup } from "@/actions/auth"
import { Button } from "@/components/ui/button"

function Field({
  label,
  name,
  hint,
  ...input
}: { label: string; name: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        required
        className="h-11 rounded-[4px] border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        {...input}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 rounded-lg text-[15px]">
      {pending ? pendingLabel : label}
    </Button>
  )
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, formAction] = useActionState(mode === "login" ? login : signup, {})
  const isLogin = mode === "login"
  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {isLogin ? null : (
        <Field label="Display name" name="name" autoComplete="name" maxLength={50} />
      )}
      <Field
        label="Handle"
        name="handle"
        autoComplete="username"
        placeholder="your_handle"
        hint={isLogin ? undefined : "3 to 15 letters, numbers or underscores."}
      />
      {isLogin ? null : (
        <Field label="Date of birth" name="birthday" type="date" hint="You must be at least 13. Only you can see this." />
      )}
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={isLogin ? "current-password" : "new-password"}
        hint={isLogin ? undefined : "At least 8 characters."}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton label={isLogin ? "Log in" : "Create account"} pendingLabel={isLogin ? "Logging in" : "Creating account"} />
    </form>
  )
}
