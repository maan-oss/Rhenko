"use client"

import { useActionState, useState, type InputHTMLAttributes, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { login, signup } from "@/actions/auth"
import { DateField } from "@/components/app/date-field"
import { handleProblem, HANDLE_MAX } from "@/lib/rules"
import { cn } from "@/lib/utils"

// Every field shares one shape. Focus changes the border only, so there is no ring to see.
const FIELD =
  "h-12 w-full min-w-0 rounded-2xl border border-border bg-background px-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"

function Field({
  label,
  name,
  hint,
  children,
  id,
}: {
  label: string
  name: string
  hint?: ReactNode
  children: ReactNode
  id: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? <div className="text-[13px] text-muted-foreground" data-field={name}>{hint}</div> : null}
    </div>
  )
}

function TextField({ name, label, ...input }: { name: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`
  return (
    <Field label={label} name={name} id={id}>
      <input id={id} name={name} required className={FIELD} {...input} />
    </Field>
  )
}

// The @ is part of the field, so it is always there and never typed.
function HandleField({ isLogin }: { isLogin: boolean }) {
  const [value, setValue] = useState("")
  const problem = isLogin ? null : handleProblem(value)
  const id = "field-handle"
  return (
    <Field
      label="Handle"
      name="handle"
      id={id}
      hint={
        isLogin ? null : problem ? (
          <span role="alert" className="text-destructive">
            {problem}
          </span>
        ) : (
          <span>3 to 15 characters. Letters, numbers and underscores.</span>
        )
      }
    >
      <div className={cn(FIELD, "flex items-center gap-1 px-4 focus-within:border-foreground", problem && "border-destructive hover:border-destructive")}>
        <span aria-hidden="true" className="text-muted-foreground select-none">
          @
        </span>
        <input
          id={id}
          name="handle"
          required
          maxLength={HANDLE_MAX}
          autoComplete={isLogin ? "username" : "off"}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="your_handle"
          aria-invalid={problem ? true : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/^@+/, ""))}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />
      </div>
    </Field>
  )
}

function SubmitButton({ label, pendingLabel, disabled }: { label: string; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="h-12 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-85 disabled:opacity-40"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, formAction] = useActionState(mode === "login" ? login : signup, {})
  const isLogin = mode === "login"
  return (
    <form action={formAction} className="flex w-full flex-col gap-5">
      {isLogin ? null : (
        <TextField name="name" label="Display name" autoComplete="off" maxLength={50} placeholder="Dan" />
      )}
      <HandleField isLogin={isLogin} />
      {isLogin ? null : (
        <Field label="Date of birth" name="birthday" id="field-birthday" hint="You must be at least 13. Only you can see this.">
          <DateField id="field-birthday" name="birthday" placeholder="Pick your birthday" />
        </Field>
      )}
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete={isLogin ? "current-password" : "new-password"}
        placeholder={isLogin ? "Your password" : "At least 8 characters"}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton
        label={isLogin ? "Log in" : "Create account"}
        pendingLabel={isLogin ? "Logging in" : "Creating account"}
      />
    </form>
  )
}
