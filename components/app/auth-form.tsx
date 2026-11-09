"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react"
import { useSafeActionState } from "@/lib/use-safe-action-state"
import { useFormStatus } from "react-dom"
import { Eye, EyeOff } from "lucide-react"
import { requestStamp } from "@/actions/proof"
import { ProofCheck } from "@/components/app/proof-check"
import { PasskeyLoginButton, SecurityKeyButton } from "@/components/app/passkey-panel"
import {
  checkEmailFree,
  login,
  requestPasswordReset,
  resetPassword,
  signup,
  verifySecondFactor,
  type AuthState,
  type ResetRequestState,
} from "@/actions/auth"
import { motion, useReducedMotion } from "motion/react"
import { SPRING_SHEET } from "@/components/app/motion"
import { DateField } from "@/components/app/date-field"
import { OnboardingSteps, SETUP_STEPS } from "@/components/app/onboarding-steps"
import { ErrorText, FloatingInput } from "@/components/app/floating-field"
import { AuthBar, AuthFooter, AuthMark, AuthTitle, AuthTopLink, PRIMARY_BUTTON } from "@/components/app/auth-frame"
import { SocialSignUpButton } from "@/components/app/social-buttons"
import { toast } from "sonner"
import { EMAIL_CODE_MINUTES, MAX_EMAIL, PASSWORD_RULE } from "@/lib/account-rules"
import { MINIMUM_AGE } from "@/lib/legal"
import { handleProblem, HANDLE_MAX, MAX_NAME, MAX_PASSWORD, MIN_PASSWORD } from "@/lib/rules"
import { cn } from "@/lib/utils"

// The fields of a form stand one above another, each in its own full shape, with the same gap as the birthday field.
const FIELDS = "flex flex-col gap-3"
const EMAIL_TAKEN = "That email is already used by another account. Use a different one, or leave it blank."
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

// A labelled field. The label is the only text in an empty field, so no example is shown.
function TextField({
  name,
  label,
  help,
  error,
  aside,
  optional,
  ...input
}: {
  name: string
  label: string
  help?: ReactNode
  error?: string | null
  aside?: ReactNode
  optional?: boolean
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FloatingInput
      id={`field-${name}`}
      name={name}
      label={label}
      optional={optional}
      help={help}
      error={error}
      aside={aside}
      {...input}
    />
  )
}

// The password field can show what was typed. The button is a real button, so it works from the keyboard too. While the text is
// hidden it is drawn in the system font, whose dots are round; the app's own font draws them as squares.
function PasswordField({
  name,
  label,
  autoComplete,
  value,
  onChange,
  help,
}: {
  name: string
  label: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  help?: ReactNode
}) {
  const [shown, setShown] = useState(false)
  return (
    <FloatingInput
      id={`field-${name}`}
      name={name}
      label={label}
      type={shown ? "text" : "password"}
      autoComplete={autoComplete}
      autoCapitalize="none"
      spellCheck={false}
      enterKeyHint="go"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={shown ? undefined : "font-[system-ui]"}
      help={help}
      trailing={
        <button
          type="button"
          onClick={() => setShown((current) => !current)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          tabIndex={-1}
          className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          {shown ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
        </button>
      }
    />
  )
}

// The @ is part of the field, so it is always there and never typed. A handle's problem is named once the person leaves the
// field, not on each letter.
function HandleField({
  isLogin,
  value,
  onChange,
}: {
  isLogin: boolean
  value: string
  onChange: (value: string) => void
}) {
  const [left, setLeft] = useState(false)
  const problem = isLogin || value.length === 0 ? null : handleProblem(value)
  return (
    <FloatingInput
      id="field-handle"
      name="handle"
      label="Handle"
      prefix="@"
      maxLength={HANDLE_MAX}
      autoComplete={isLogin ? "username" : "off"}
      autoCapitalize="none"
      spellCheck={false}
      enterKeyHint={isLogin ? "next" : "done"}
      value={value}
      onChange={(event) => onChange(event.target.value.replace(/^@+/, ""))}
      onBlur={() => setLeft(true)}
      help={isLogin ? null : "3 to 15 letters, numbers or underscores."}
      aside={isLogin ? null : <Counter length={value.length} max={HANDLE_MAX} from={11} />}
      error={left ? problem : null}
    />
  )
}

// The one primary action on a screen. It is disabled until the screen can be sent. While it works it says what it is doing.
function SubmitButton({
  label,
  pendingLabel,
  disabled,
  className,
}: {
  label: string
  pendingLabel: string
  disabled?: boolean
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending || undefined} className={cn(PRIMARY_BUTTON, className)}>
      {pending ? pendingLabel : label}
    </button>
  )
}

// The value as it stands a moment after the person stops typing, so the rule does not flash red on every letter.
function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}

// The password rule. It is plain text. It turns red only when the settled password is too short; empty and long enough are
// the same neutral tone, and nothing ticks.
function PasswordRule({ value }: { value: string }) {
  const settled = useSettled(value, 700)
  const short = settled.length > 0 && settled.length < MIN_PASSWORD
  return <span className={cn("transition-colors duration-200", short ? "text-destructive" : "text-muted-foreground")}>{PASSWORD_RULE}</span>
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

// `next` is where a sign-in goes afterwards (a group invite), already checked by the page. `notice` is a message shown
// under the top bar of sign-up.
export function AuthForm({ mode, next = null, notice = null }: { mode: "login" | "signup"; next?: string | null; notice?: ReactNode }) {
  return mode === "login" ? <LoginForm next={next} /> : <SignupForm notice={notice} />
}

// A field no person sees or fills in. Programs fill in every field they find, so a value here marks the form as sent by one.
function HoneyPot() {
  return (
    <input
      type="text"
      name="website"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      defaultValue=""
      className="pointer-events-none absolute -left-[10000px] h-0 w-0 opacity-0"
    />
  )
}

// The answer to the human check for one form. An answer is used up by a send, so after every reply from the action the
// check runs again for a new answer, and the form waits for it.
function useCheckAnswer(reply: { error?: string; sent?: boolean; proofRequired?: boolean }) {
  const [proof, setProof] = useState("")
  const [key, setKey] = useState(0)
  const [seen, setSeen] = useState(reply)
  if (seen !== reply) {
    setSeen(reply)
    setProof("")
    setKey((count) => count + 1)
  }
  return { proof, key, onReady: (value: string | null) => setProof(value ?? "") }
}

// Sign in: the handle and password, one above the other, the primary action at the bottom, then the forgot link, then the passkey.
function LoginForm({ next }: { next: string | null }) {
  const [state, formAction] = useSafeActionState(login, {} as AuthState)
  const [handle, setHandle] = useState("")
  const [password, setPassword] = useState("")
  const check = useCheckAnswer(state)
  return (
    <form action={formAction} className="settle flex flex-1 flex-col">
      <div className={cn(FIELDS, "mt-8")}>
        <HandleField isLogin value={handle} onChange={setHandle} />
        <PasswordField name="password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
      </div>
      <HoneyPot />
      <input type="hidden" name="proof" value={state.proofRequired ? check.proof : ""} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error || state.proofRequired ? (
        <div className="mt-4 flex flex-col gap-4">
          <ErrorText message={state.error} />
          {state.proofRequired ? <ProofCheck key={check.key} onReady={check.onReady} /> : null}
        </div>
      ) : null}
      <AuthFooter>
        <SubmitButton
          label="Log in"
          pendingLabel="Logging in"
          disabled={handle.length === 0 || password.length === 0 || (state.proofRequired === true && check.proof === "")}
        />
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center self-center px-3 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground">
          Forgot password?
        </Link>
        <div className="flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <PasskeyLoginButton next={next} />
      </AuthFooter>
    </form>
  )
}

// Three short screens, one question each: who you are, when you were born, then a password and the terms.
// Every field stays in the form the whole time, so the sign-up action gets all of them. A screen that is not
// showing is hidden, not removed, and the Continue button only moves on when that screen is valid.
const SIGNUP_LAST = 2
// The three sign-up screens, then the profile screen in setup: six steps in all, the same on every onboarding screen.
const SIGNUP_STEPS_TOTAL = SETUP_STEPS.total

function SignupForm({ notice }: { notice: ReactNode }) {
  const [state, formAction] = useSafeActionState(signup, {} as AuthState)
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [birthday, setBirthday] = useState("")
  const [email, setEmail] = useState("")
  // The email is named as wrong only once the person has left its field, never while they are still typing it.
  const [emailLeft, setEmailLeft] = useState(false)
  const [password, setPassword] = useState("")
  const [agree, setAgree] = useState(false)
  // While the date drawer is open, the birthday group is raised above it and the screen lifts by `lift` pixels, so the field
  // stays above the drawer's top edge. It is reset the moment the drawer closes.
  const [datePick, setDatePick] = useState({ open: false, lift: 0 })
  const reduce = useReducedMotion()
  const formRef = useRef<HTMLFormElement>(null)
  // The human check runs from the moment the form opens, while the person fills in the screens, so it is ready at the end.
  const check = useCheckAnswer(state)
  // The form's start time goes straight into its hidden field, with no re-render, so a person who is typing when it arrives
  // is not interrupted. It is ready long before the last screen, when the form is sent.
  const stampField = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let live = true
    requestStamp().then((value) => {
      if (live && stampField.current) stampField.current.value = value
    })
    return () => {
      live = false
    }
  }, [])

  // The email is checked a moment after the person stops typing, so a taken address is named before the screen can go on.
  // The answer is kept with the address it was for, so an answer for an old address never counts for a new one.
  const [checked, setChecked] = useState<{ email: string; taken: boolean } | null>(null)
  const emailChecking = email !== "" && EMAIL_SHAPE.test(email) && checked?.email !== email
  const emailTaken = Boolean(checked && checked.email === email && checked.taken)
  useEffect(() => {
    if (email === "" || !EMAIL_SHAPE.test(email)) return
    let live = true
    const timer = setTimeout(() => {
      checkEmailFree(email).then((result) => {
        if (live) setChecked({ email, taken: result.taken === true })
      })
    }, 600)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [email])

  // A date that is too young is named once the calendar has closed, never while it is still open.
  const showAgeError = Boolean(birthday) && !isOldEnough(birthday) && !datePick.open

  const valid = [
    name.trim().length > 0 && name.length <= MAX_NAME && handle.length > 0 && !handleProblem(handle),
    isOldEnough(birthday) && (email === "" || (EMAIL_SHAPE.test(email) && !emailChecking && !emailTaken)),
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

  // The screens share one grid cell, so the form is as tall as its tallest screen. A screen that is not showing is
  // invisible, not removed, so the page does not move when the step changes. Only the screen showing settles in.
  // `settle-clean` leaves no transform behind after it runs, so a raised field can rise above the date drawer's dimming.
  const screen = (index: number) => cn("col-start-1 row-start-1 flex min-h-0 flex-col", step === index ? "settle-clean" : "invisible")

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="settle-clean flex flex-1 flex-col" noValidate>
      <AuthBar
        left={<AuthMark />}
        right={step === 0 ? <AuthTopLink href="/login">Log in</AuthTopLink> : null}
      />
      <div className="mt-3">
        <OnboardingSteps current={step} total={SIGNUP_STEPS_TOTAL} />
      </div>
      {notice ? <div className="mt-4">{notice}</div> : null}
      {/* Outside the screens, so a refused sign-up shows its reason on whichever screen it sends the person back to. */}
      {state.error ? (
        <div className="mt-4">
          <ErrorText message={state.error} />
        </div>
      ) : null}

      {/* The screens sit beneath the steps above them. While the date drawer is open they lift under that edge, so the birthday
          row clears the drawer and nothing is drawn over the steps. */}
      <div className="-mx-3 flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 -mb-3">
        <motion.div
          className="relative grid flex-1"
          animate={{ top: datePick.open ? -datePick.lift : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SHEET}
        >
          <section data-step={0} className={screen(0)}>
            <AuthTitle title="Create your account">Start with a name and a handle.</AuthTitle>
            {/* A provider sign-up sits above the form, as on the native sign-up screens. */}
            <div className="mt-6 flex flex-col gap-3">
              <SocialSignUpButton provider="google" onClick={() => toast("Sign up with Google isn't connected yet.")} />
              <SocialSignUpButton provider="apple" onClick={() => toast("Sign up with Apple isn't connected yet.")} />
            </div>
            <div className="mt-5 flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className={cn(FIELDS, "mt-5")}>
              <TextField
                name="name"
                label="Name"
                autoComplete="name"
                enterKeyHint="next"
                maxLength={MAX_NAME}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aside={<Counter length={name.length} max={MAX_NAME} from={40} />}
              />
              <HandleField isLogin={false} value={handle} onChange={setHandle} />
            </div>
            <AuthFooter>
              <Button onClick={() => setStep(1)} disabled={!valid[0]}>
                Continue
              </Button>
            </AuthFooter>
          </section>

          <section data-step={1} className={screen(1)}>
            <AuthTitle title="When were you born?">Only you can see this.</AuthTitle>
            {/* The birthday and the email are fields of their own, each in its full shape. A message shows under the birthday only
                when the date is too young, and only once the calendar has closed, so it never appears while the person is choosing. */}
            <div className={cn(FIELDS, "mt-8")}>
              <DateField
                id="field-birthday"
                name="birthday"
                label="Date of birth"
                variant="card"
                placeholder="Date of birth"
                invalid={showAgeError}
                onChange={setBirthday}
                onSheetChange={(open, lift) => setDatePick((current) => (current.open === open && current.lift === lift ? current : { open, lift }))}
              />
              {showAgeError ? <ErrorText message={`You must be ${MINIMUM_AGE} or older to join.`} /> : null}
              <TextField
                name="email"
                label="Email"
                type="email"
                optional
                autoComplete="email"
                enterKeyHint="done"
                maxLength={MAX_EMAIL}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmailLeft(true)}
                help={emailChecking ? "Checking that it is free…" : null}
                error={
                  emailLeft && email !== "" && !EMAIL_SHAPE.test(email)
                    ? "That does not look like an email."
                    : emailTaken
                      ? EMAIL_TAKEN
                      : null
                }
              />
            </div>
            <AuthFooter>
              <div className="flex items-center gap-3">
                <Button onClick={() => setStep(2)} disabled={!valid[1]} className="flex-1">
                  Continue
                </Button>
                <BackButton onClick={() => setStep(0)} />
              </div>
            </AuthFooter>
          </section>

          <section data-step={2} className={screen(2)}>
            <AuthTitle title="Set a password">Use one you do not use anywhere else.</AuthTitle>
            <div className={cn(FIELDS, "mt-8")}>
              <PasswordField
                name="password"
                label="Password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                help={<PasswordRule value={password} />}
              />
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[20px] border border-border bg-card px-4 py-3.5 text-[14px] leading-relaxed">
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
            <AuthFooter>
              {/* Mounted only on this screen, so a Cloudflare check renders where it can be seen. Solving takes about as long as typing a password. */}
              {step === SIGNUP_LAST ? <ProofCheck key={check.key} quiet onReady={check.onReady} /> : null}
              <div className="flex items-center gap-3">
                <SubmitButton
                  label="Create account"
                  pendingLabel="Creating account"
                  disabled={!valid[2] || check.proof === ""}
                  className="flex-1"
                />
                <BackButton onClick={() => setStep(1)} />
              </div>
            </AuthFooter>
          </section>
        </motion.div>
      </div>

      <HoneyPot />
      {/* No value prop: React would write its value back on the next render and clear the stamp. */}
      <input ref={stampField} type="hidden" name="stamp" />
      <input type="hidden" name="proof" value={check.proof} />
    </form>
  )
}

// Back to the step before, at the bottom right beside the primary action. It does not send the form.
function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 shrink-0 items-center justify-center rounded-full border border-border bg-card px-7 text-[17px] font-semibold text-foreground transition-colors duration-200 hover:bg-foreground/[0.04]"
    >
      Back
    </button>
  )
}

// The primary action on a step that is not the last one. It does not send the form.
function Button({
  onClick,
  disabled,
  children,
  className,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn(PRIMARY_BUTTON, className)}>
      {children}
    </button>
  )
}

// The second step of sign-in: a six-digit code from the authenticator app, or a recovery code. When the server
// can't read the authenticator key, only recovery codes can work, and the field says so.
export function VerifyCodeForm({ usable, hasKeys, next = null }: { usable: boolean; hasKeys: boolean; next?: string | null }) {
  const [state, action] = useSafeActionState(verifySecondFactor, {} as AuthState)
  const [code, setCode] = useState("")
  return (
    <form action={action} className="settle flex flex-1 flex-col">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className={cn(FIELDS, "mt-8")}>
        <TextField
          name="code"
          label={usable ? "Code" : "Recovery code"}
          autoFocus
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={20}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="text-center text-[22px] font-semibold tracking-[0.2em]"
          help={usable ? "From your authenticator app, or a recovery code." : "Each recovery code works once."}
        />
      </div>
      {state.error ? (
        <div className="mt-4">
          <ErrorText message={state.error} />
        </div>
      ) : null}
      <AuthFooter>
        <SubmitButton label="Continue" pendingLabel="Checking" disabled={code.trim().length === 0} />
        {hasKeys ? (
          <>
            <div className="flex items-center gap-3 text-[13px] text-muted-foreground" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <SecurityKeyButton next={next} />
          </>
        ) : null}
      </AuthFooter>
    </form>
  )
}

// Asks for a reset code. The reply is the same whether or not an account matched.
export function ForgotPasswordForm() {
  const [state, action] = useSafeActionState(requestPasswordReset, {} as ResetRequestState)
  const [account, setAccount] = useState("")
  const check = useCheckAnswer(state)
  const next = state.email ? `/reset-password?email=${encodeURIComponent(state.email)}` : "/reset-password"
  return (
    <form action={action} className="settle flex flex-1 flex-col">
      <div className={cn(FIELDS, "mt-8")}>
        <TextField
          name="account"
          label="Handle or email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={MAX_EMAIL}
          value={account}
          onChange={(event) => setAccount(event.target.value)}
        />
      </div>
      <HoneyPot />
      <input type="hidden" name="proof" value={check.proof} />
      {state.error ? (
        <div className="mt-4">
          <ErrorText message={state.error} />
        </div>
      ) : null}
      {state.sent ? (
        <div role="status" className="settle mt-4 flex flex-col gap-3 rounded-[20px] border border-border bg-card px-4 py-4 text-[14px] leading-snug">
          <p>If the account has a verified email, a code is on its way. It lasts {EMAIL_CODE_MINUTES} minutes.</p>
          <Link href={next} className="flex h-11 items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-90">
            Enter the code
          </Link>
        </div>
      ) : null}
      <AuthFooter>
        {/* Every reset request sends an email, so each one waits for the human check. */}
        <ProofCheck key={check.key} onReady={check.onReady} />
        <SubmitButton
          label={state.sent ? "Send another code" : "Send code"}
          pendingLabel="Sending"
          disabled={account.trim().length === 0 || check.proof === ""}
        />
      </AuthFooter>
    </form>
  )
}

// Sets a new password with the emailed code. Every device signed in to the account is signed out.
export function ResetPasswordForm({ email: initialEmail }: { email: string }) {
  const [state, action] = useSafeActionState(resetPassword, {} as AuthState)
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const ready = email.trim().length > 0 && code.trim().length > 0 && password.length >= MIN_PASSWORD
  return (
    <form action={action} className="settle flex flex-1 flex-col">
      <div className={cn(FIELDS, "mt-8")}>
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          enterKeyHint="next"
          maxLength={MAX_EMAIL}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          help="The verified email on your account."
        />
        <TextField
          name="code"
          label="Code"
          autoComplete="one-time-code"
          inputMode="numeric"
          enterKeyHint="next"
          maxLength={7}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="tracking-[0.2em]"
        />
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          help={<PasswordRule value={password} />}
        />
      </div>
      {state.error ? (
        <div className="mt-4">
          <ErrorText message={state.error} />
        </div>
      ) : null}
      <AuthFooter>
        <SubmitButton label="Set new password" pendingLabel="Saving" disabled={!ready} />
        <p className="text-center text-[13px] text-muted-foreground">Every device you are signed in on is signed out.</p>
      </AuthFooter>
    </form>
  )
}
