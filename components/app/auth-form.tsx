"use client"

import Link from "next/link"
import { useActionState, useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { Check, Eye, EyeOff } from "lucide-react"
import { PasskeyLoginButton, SecurityKeyButton } from "@/components/app/passkey-panel"
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
import { MINIMUM_AGE } from "@/lib/legal"
import { handleProblem, HANDLE_MAX, MAX_NAME, MAX_PASSWORD, MIN_PASSWORD } from "@/lib/rules"
import { cn } from "@/lib/utils"

// One field shape everywhere. Focus turns the border ink and adds a dusk halo; an error turns the border red.
// Inputs are 16px so phones do not zoom in when they are tapped.
const FIELD =
  "h-12 w-full min-w-0 rounded-xl border border-border bg-card px-4 text-base outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/30 focus:border-foreground focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--dusk)_22%,transparent)]"
const FIELD_ERROR = "border-destructive hover:border-destructive focus:border-destructive focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_18%,transparent)]"

const LINK = "font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"

// A counter shows only when a limit is close, so a long name or handle is never a surprise.
function Counter({ length, max, from }: { length: number; max: number; from: number }) {
  if (length < from) return null
  return (
    <span className={cn("text-[13px] tabular-nums", length > max ? "text-destructive" : "text-muted-foreground")}>
      {length}/{max}
    </span>
  )
}

function Field({
  id,
  label,
  aside,
  help,
  error,
  children,
}: {
  id: string
  label: string
  aside?: ReactNode
  help?: ReactNode
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-5 items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] leading-snug text-destructive">
          {error}
        </p>
      ) : help ? (
        <div className="text-[13px] leading-snug text-muted-foreground">{help}</div>
      ) : null}
    </div>
  )
}

function TextField({
  name,
  label,
  help,
  error,
  aside,
  className,
  ...input
}: { name: string; label: string; help?: ReactNode; error?: string | null; aside?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`
  return (
    <Field id={id} label={label} aside={aside} help={help} error={error}>
      <input
        id={id}
        name={name}
        className={cn(FIELD, error && FIELD_ERROR, className)}
        aria-invalid={error ? true : undefined}
        {...input}
      />
    </Field>
  )
}

// The password field can show what was typed. The button is a real button, so it works from the keyboard too.
function PasswordField({
  name,
  label,
  placeholder,
  autoComplete,
  value,
  onChange,
  help,
  aside,
}: {
  name: string
  label: string
  placeholder: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  help?: ReactNode
  aside?: ReactNode
}) {
  const id = `field-${name}`
  const [shown, setShown] = useState(false)
  return (
    <Field id={id} label={label} aside={aside} help={help}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(FIELD, "pr-12")}
        />
        <button
          type="button"
          onClick={() => setShown((current) => !current)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          tabIndex={-1}
          className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          {shown ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
        </button>
      </div>
    </Field>
  )
}

// The @ is part of the field, so it is always there and never typed.
function HandleField({
  isLogin,
  value,
  onChange,
}: {
  isLogin: boolean
  value: string
  onChange: (value: string) => void
}) {
  const id = "field-handle"
  const problem = isLogin || value.length === 0 ? null : handleProblem(value)
  return (
    <Field
      id={id}
      label="Handle"
      aside={isLogin ? null : <Counter length={value.length} max={HANDLE_MAX} from={11} />}
      help={isLogin ? null : "3 to 15 letters, numbers or underscores."}
      error={problem}
    >
      <div
        className={cn(
          FIELD,
          "flex items-center gap-1 px-4 focus-within:border-foreground focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--dusk)_22%,transparent)]",
          problem && FIELD_ERROR
        )}
      >
        <span aria-hidden="true" className="select-none text-muted-foreground">
          @
        </span>
        <input
          id={id}
          name="handle"
          maxLength={HANDLE_MAX}
          autoComplete={isLogin ? "username" : "off"}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="your_handle"
          aria-invalid={problem ? true : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/^@+/, ""))}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
        />
      </div>
    </Field>
  )
}

// The one primary action on a screen. It is disabled until the screen can be sent, and it shows a dot while it works.
function SubmitButton({ label, pendingLabel, disabled }: { label: string; pendingLabel: string; disabled?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? (
        <span className="flex items-center gap-2.5">
          <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
          {pendingLabel}
        </span>
      ) : (
        label
      )}
    </button>
  )
}

function ErrorText({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="settle rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[14px] leading-snug text-destructive">
      {message}
    </p>
  )
}

// The rule as a line that ticks itself once it is met.
function Rule({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 transition-colors duration-200", met ? "text-dusk" : "text-muted-foreground")}>
      <span className={cn("grid size-4 place-items-center rounded-full border transition-colors duration-200", met ? "border-dusk bg-dusk text-background" : "border-border")}>
        {met ? <Check className="size-3" strokeWidth={3} aria-hidden="true" /> : null}
      </span>
      {children}
    </span>
  )
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The birthday as the server reads it: a date that puts the person at least MINIMUM_AGE years old today.
function isOldEnough(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const today = new Date()
  let age = today.getFullYear() - year
  if (today.getMonth() < month || (today.getMonth() === month && today.getDate() < day)) age -= 1
  return age >= MINIMUM_AGE
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  return mode === "login" ? <LoginForm /> : <SignupForm />
}

function LoginForm() {
  const [state, formAction] = useActionState(login, {} as AuthState)
  const [handle, setHandle] = useState("")
  const [password, setPassword] = useState("")
  return (
    <>
    <form action={formAction} className="settle flex w-full flex-col gap-5">
      <HandleField isLogin value={handle} onChange={setHandle} />
      <PasswordField
        name="password"
        label="Password"
        placeholder="Your password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        aside={
          <Link href="/forgot-password" className="text-[13px] font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline">
            Forgot?
          </Link>
        }
      />
      <ErrorText message={state.error} />
      <SubmitButton label="Log in" pendingLabel="Logging in" disabled={handle.length === 0 || password.length === 0} />
    </form>
    <div className="settle mt-5 flex w-full flex-col gap-5">
      <div className="flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <PasskeyLoginButton />
    </div>
    </>
  )
}

// Three short screens, one question each: who you are, when you were born, then a password and the terms.
// Every field stays in the form the whole time, so the sign-up action gets all of them. A screen that is not
// showing is hidden, not removed, and the Continue button only moves on when that screen is valid.
const SIGNUP_LAST = 2

function SignupForm() {
  const [state, formAction] = useActionState(signup, {} as AuthState)
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [birthday, setBirthday] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [agree, setAgree] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const valid = [
    name.trim().length > 0 && name.length <= MAX_NAME && handle.length > 0 && !handleProblem(handle),
    isOldEnough(birthday) && (email === "" || EMAIL_SHAPE.test(email)),
    password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD && agree,
  ]

  // A refused sign-up sends the person back to the screen with the problem, and clears the password as before. It is
  // done while rendering, when a new refusal arrives, so the screen never shows the wrong step for a frame.
  const [seenError, setSeenError] = useState<string | undefined>(undefined)
  if (state.error !== seenError) {
    setSeenError(state.error)
    if (state.error) {
      const error = state.error.toLowerCase()
      setStep(/handle|name/.test(error) ? 0 : /birth|old|email/.test(error) ? 1 : SIGNUP_LAST)
      if (/password/.test(error)) setPassword("")
    }
  }

  // Each new screen starts with its first field ready to type in.
  useEffect(() => {
    const first = formRef.current?.querySelector<HTMLElement>(
      `[data-step="${step}"] input:not([type=checkbox]):not([type=hidden]), [data-step="${step}"] #field-birthday`
    )
    first?.focus({ preventScroll: true })
  }, [step])

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // Enter on an earlier screen moves on instead of sending the whole form.
    if (step < SIGNUP_LAST) {
      event.preventDefault()
      if (valid[step]) setStep(step + 1)
    }
  }

  const shownFor = (index: number) => (step === index ? undefined : true)

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span key={index} className={cn("h-1 flex-1 rounded-full transition-colors duration-500", index <= step ? "bg-foreground" : "bg-border")} />
        ))}
      </div>

      <form ref={formRef} action={formAction} onSubmit={onSubmit} className="flex w-full flex-col gap-8" noValidate>
        <section data-step={0} hidden={shownFor(0)} className="settle flex flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Create your account</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Start with a name and a handle.</p>
          </div>
          <TextField
            name="name"
            label="Name"
            autoComplete="name"
            maxLength={MAX_NAME}
            placeholder="Dan"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aside={<Counter length={name.length} max={MAX_NAME} from={40} />}
          />
          <HandleField isLogin={false} value={handle} onChange={setHandle} />
          <div className="flex flex-col gap-3">
            <Button onClick={() => setStep(1)} disabled={!valid[0]}>
              Continue
            </Button>
          </div>
        </section>

        <section data-step={1} hidden={shownFor(1)} className="settle flex flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h1 className="text-[30px] leading-tight font-semibold tracking-tight">When were you born?</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Only you can see this.</p>
          </div>
          <Field
            id="field-birthday"
            label="Date of birth"
            help={`Rhenko is for people ${MINIMUM_AGE} or older.`}
            error={birthday && !isOldEnough(birthday) ? `You must be ${MINIMUM_AGE} or older to join.` : null}
          >
            <DateField id="field-birthday" name="birthday" placeholder="Pick your birthday" onChange={setBirthday} />
          </Field>
          <TextField
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            maxLength={MAX_EMAIL}
            placeholder="name@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aside={<span className="text-[13px] text-muted-foreground">Optional</span>}
            help="Only for resetting your password."
            error={email && !EMAIL_SHAPE.test(email) ? "That does not look like an email." : null}
          />
          <div className="flex flex-col gap-3">
            <Button onClick={() => setStep(2)} disabled={!valid[1]}>
              Continue
            </Button>
            <BackButton onClick={() => setStep(0)} />
          </div>
        </section>

        <section data-step={2} hidden={shownFor(2)} className="settle flex flex-col gap-7">
          <div className="flex flex-col gap-2">
            <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Set a password</h1>
            <p className="text-[15px] leading-relaxed text-muted-foreground">Use one you do not use anywhere else.</p>
          </div>
          <PasswordField
            name="password"
            label="Password"
            placeholder="Choose a password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            help={<Rule met={password.length >= MIN_PASSWORD}>{PASSWORD_RULE}</Rule>}
          />
          <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-relaxed">
            <input
              type="checkbox"
              name="agree"
              required
              checked={agree}
              onChange={(event) => setAgree(event.target.checked)}
              className="mt-[3px] size-4 shrink-0 cursor-pointer accent-dusk"
            />
            <span>
              I am {MINIMUM_AGE} or older, and I agree to the{" "}
              <Link href="/terms" target="_blank" className={LINK}>
                Terms
              </Link>{" "}
              and the{" "}
              <Link href="/privacy" target="_blank" className={LINK}>
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <div className="flex flex-col gap-3">
            <SubmitButton label="Create account" pendingLabel="Creating account" disabled={!valid[2]} />
            <BackButton onClick={() => setStep(1)} />
          </div>
        </section>

        {/* Outside the screens, so a refused sign-up shows its reason on whichever screen it sends the person back to. */}
        <ErrorText message={state.error} />

      </form>
    </div>
  )
}

// A plain button for the primary action on a step that is not the last one. It does not send the form.
function Button({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      Back
    </button>
  )
}

// The second step of sign-in: a six-digit code from the authenticator app, or a recovery code. When the server
// can't read the authenticator key, only recovery codes can work, and the field says so.
export function VerifyCodeForm({ usable, hasKeys }: { usable: boolean; hasKeys: boolean }) {
  const [state, action] = useActionState(verifySecondFactor, {} as AuthState)
  const [code, setCode] = useState("")
  return (
    <form action={action} className="settle flex w-full flex-col gap-5">
      <TextField
        name="code"
        label={usable ? "Code" : "Recovery code"}
        autoFocus
        autoComplete="one-time-code"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={20}
        placeholder={usable ? "123456" : "abcd-efgh"}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        className="h-14 text-center text-xl font-semibold tracking-[0.2em]"
        help={usable ? "From your authenticator app, or a recovery code." : "Each recovery code works once."}
      />
      <ErrorText message={state.error} />
      <SubmitButton label="Continue" pendingLabel="Checking" disabled={code.trim().length === 0} />
      {hasKeys ? (
        <>
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <SecurityKeyButton />
        </>
      ) : null}
    </form>
  )
}

// Asks for a reset code. The reply is the same whether or not an account matched.
export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, {} as ResetRequestState)
  const [account, setAccount] = useState("")
  const next = state.email ? `/reset-password?email=${encodeURIComponent(state.email)}` : "/reset-password"
  return (
    <form action={action} className="settle flex w-full flex-col gap-5">
      <TextField
        name="account"
        label="Handle or email"
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
        <div role="status" className="settle flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4 text-[14px] leading-snug">
          <p>If the account has a verified email, a code is on its way. It lasts {EMAIL_CODE_MINUTES} minutes.</p>
          <Link href={next} className="flex h-11 items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-90">
            Enter the code
          </Link>
        </div>
      ) : null}
      <SubmitButton label={state.sent ? "Send another code" : "Send code"} pendingLabel="Sending" disabled={account.trim().length === 0} />
    </form>
  )
}

// Sets a new password with the emailed code. Every device signed in to the account is signed out.
export function ResetPasswordForm({ email: initialEmail }: { email: string }) {
  const [state, action] = useActionState(resetPassword, {} as AuthState)
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const ready = email.trim().length > 0 && code.trim().length > 0 && password.length >= MIN_PASSWORD
  return (
    <form action={action} className="settle flex w-full flex-col gap-5">
      <TextField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        maxLength={MAX_EMAIL}
        placeholder="name@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        help="The verified email on your account."
      />
      <TextField
        name="code"
        label="Code"
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={7}
        placeholder="123456"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        className="tracking-[0.2em]"
      />
      <PasswordField
        name="password"
        label="New password"
        placeholder="Choose a password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        help={<Rule met={password.length >= MIN_PASSWORD}>{PASSWORD_RULE}</Rule>}
      />
      <ErrorText message={state.error} />
      <SubmitButton label="Set new password" pendingLabel="Saving" disabled={!ready} />
      <p className="text-center text-[13px] text-muted-foreground">Every device you are signed in on is signed out.</p>
    </form>
  )
}
