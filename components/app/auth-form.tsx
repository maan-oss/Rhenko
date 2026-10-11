"use client"

import Link from "next/link"
import { useActionState, useState, type InputHTMLAttributes, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import {
  login,
  requestPasswordReset,
  resetPassword,
  signup,
  verifySecondFactor,
  type AuthState,
  type ResetRequestState,
} from "@/actions/auth"
import { DateField } from "@/components/app/date-field"
import { EMAIL_CODE_MINUTES, MAX_EMAIL, PASSWORD_RULE } from "@/lib/account-rules"
import { handleProblem, HANDLE_MAX, MAX_NAME } from "@/lib/rules"
import { cn } from "@/lib/utils"

// Every field shares one shape. Focus changes the border only, so there is no ring to see.
const FIELD =
  "h-12 w-full min-w-0 rounded-2xl border border-border bg-background px-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"

function Field({
  label,
  name,
  hint,
  aside,
  children,
  id,
}: {
  label: string
  name: string
  hint?: ReactNode
  aside?: ReactNode
  children: ReactNode
  id: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint ? <div className="text-[13px] text-muted-foreground" data-field={name}>{hint}</div> : null}
    </div>
  )
}

function TextField({
  name,
  label,
  hint,
  aside,
  ...input
}: { name: string; label: string; hint?: ReactNode; aside?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`
  return (
    <Field label={label} name={name} id={id} hint={hint} aside={aside}>
      <input id={id} name={name} className={FIELD} {...input} />
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
        <span aria-hidden="true" className="select-none text-foreground">
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

function SubmitButton({
  label,
  pendingLabel,
  disabled,
  quiet = false,
}: {
  label: string
  pendingLabel: string
  disabled?: boolean
  quiet?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        "h-12 w-full rounded-full text-[15px] font-semibold transition-[opacity,background-color] disabled:opacity-40",
        quiet ? "border border-border hover:bg-foreground/5" : "bg-foreground text-background hover:opacity-85"
      )}
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, formAction] = useActionState(mode === "login" ? login : signup, {})
  const isLogin = mode === "login"
  // Kept in state so a refused sign-up keeps what was typed. The password is the one field that clears.
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  return (
    <form action={formAction} className="flex w-full flex-col gap-5">
      {isLogin ? null : (
        <TextField
          name="name"
          label="Display name"
          required
          autoComplete="off"
          maxLength={MAX_NAME}
          placeholder="Dan"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      )}
      <HandleField isLogin={isLogin} />
      {isLogin ? null : (
        <TextField
          name="email"
          label="Email (optional)"
          type="email"
          autoComplete="email"
          maxLength={MAX_EMAIL}
          placeholder="name@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          hint="Verify it in Settings later, and you can reset your password by email."
        />
      )}
      {isLogin ? null : (
        <Field label="Date of birth" name="birthday" id="field-birthday" hint="You must be at least 13. Only you can see this.">
          <DateField id="field-birthday" name="birthday" placeholder="Pick your birthday" />
        </Field>
      )}
      <TextField
        name="password"
        label="Password"
        type="password"
        required
        autoComplete={isLogin ? "current-password" : "new-password"}
        placeholder={isLogin ? "Your password" : "Choose a password"}
        hint={isLogin ? undefined : PASSWORD_RULE}
        aside={
          isLogin ? (
            <Link href="/forgot-password" className="text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Forgot password?
            </Link>
          ) : undefined
        }
      />
      <ErrorText message={state.error} />
      <SubmitButton label={isLogin ? "Log in" : "Create account"} pendingLabel={isLogin ? "Logging in" : "Creating account"} />
    </form>
  )
}

// The second step of sign-in: a six-digit code from the authenticator app, or a recovery code. When the server
// can't read the authenticator key, only recovery codes can work, and the field says so.
export function VerifyCodeForm({ usable }: { usable: boolean }) {
  const [state, action] = useActionState(verifySecondFactor, {} as AuthState)
  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <TextField
        name="code"
        label={usable ? "Code" : "Recovery code"}
        required
        autoFocus
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        placeholder={usable ? "123456 or abcd-efgh" : "abcd-efgh"}
        className={cn(FIELD, "tracking-wider")}
        hint={
          usable
            ? "The 6-digit code from your authenticator app, or one of your recovery codes. App codes change every 30 seconds."
            : "Each recovery code works once."
        }
      />
      <ErrorText message={state.error} />
      <SubmitButton label="Continue" pendingLabel="Checking" />
    </form>
  )
}

// Asks for a reset code. The reply is the same whether or not an account matched.
export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {} as ResetRequestState)
  const [account, setAccount] = useState("")
  const next = state.email ? `/reset-password?email=${encodeURIComponent(state.email)}` : "/reset-password"
  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <TextField
        name="account"
        label="Handle or email"
        required
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={MAX_EMAIL}
        placeholder="your_handle or name@example.com"
        value={account}
        onChange={(event) => setAccount(event.target.value)}
      />
      <ErrorText message={state.error} />
      {state.sent ? (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3.5 text-[14px] leading-snug">
          <p>If that account has a verified email, a code is on its way. It works for {EMAIL_CODE_MINUTES} minutes.</p>
          <Link href={next} className="metal flex h-11 items-center justify-center rounded-full text-[15px] font-semibold transition-opacity hover:opacity-85">
            Enter the code
          </Link>
        </div>
      ) : null}
      <SubmitButton label={state.sent ? "Send another code" : "Send code"} pendingLabel="Sending" quiet={state.sent} />
    </form>
  )
}

// Sets a new password with the emailed code. Every device signed in to the account is signed out.
export function ResetPasswordForm({ email: initialEmail }: { email: string }) {
  const [state, action] = useActionState(resetPassword, {} as AuthState)
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState("")
  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <TextField
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        maxLength={MAX_EMAIL}
        placeholder="name@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        hint="The verified email on your account, where the code went."
      />
      <TextField
        name="code"
        label="Code"
        required
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={7}
        placeholder="123456"
        className={cn(FIELD, "tracking-wider")}
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <TextField
        name="password"
        label="New password"
        type="password"
        required
        autoComplete="new-password"
        placeholder="Choose a password"
        hint={PASSWORD_RULE}
      />
      <ErrorText message={state.error} />
      <SubmitButton label="Set new password" pendingLabel="Saving" />
    </form>
  )
}
