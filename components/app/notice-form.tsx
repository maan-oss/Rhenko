"use client"

import { useActionState, useState, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { submitNotice, type LegalState } from "@/actions/legal"
import { NOTICE_KINDS } from "@/lib/legal"

// The notice form keeps what was typed when a field is wrong. Every field is controlled, so React's reset after an
// action does not clear the text.
const FIELD =
  "h-12 w-full min-w-0 rounded-2xl border border-border bg-background px-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"
const AREA =
  "w-full min-w-0 rounded-2xl border border-border bg-background px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"

type Draft = {
  kind: string
  name: string
  email: string
  address: string
  url: string
  work: string
  description: string
  signature: string
  good_faith: boolean
  accurate: boolean
}

const EMPTY: Draft = {
  kind: "copyright",
  name: "",
  email: "",
  address: "",
  url: "",
  work: "",
  description: "",
  signature: "",
  good_faith: false,
  accurate: false,
}

function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-85 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send notice"}
    </button>
  )
}

export function NoticeForm() {
  const [state, formAction] = useActionState(submitNotice, {} as LegalState)
  const [draft, setDraft] = useState<Draft>(EMPTY)

  if (state.ok) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border border-border p-5">
        <p className="text-[15px] font-semibold">We received your notice.</p>
        {state.reference && state.reference !== "received" ? (
          <p className="text-[15px] leading-relaxed">
            Your reference is <span className="font-mono text-[14px]">{state.reference}</span>. We try to email it to you, so keep this reference. We will
            email you the decision and the reasons for it.
          </p>
        ) : (
          <p className="text-[15px] leading-relaxed">We will email you the decision and the reasons for it.</p>
        )}
      </div>
    )
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="What is the notice about" id="kind">
        <select id="kind" name="kind" value={draft.kind} onChange={(event) => set("kind", event.target.value)} className={FIELD}>
          {NOTICE_KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Your name" id="name" hint="Your full name, or the name of the organisation you act for.">
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          maxLength={100}
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
          className={FIELD}
        />
      </Field>
      <Field label="Email" id="email" hint="We send the reference and the decision here. It is not shown to anyone else.">
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={200}
          value={draft.email}
          onChange={(event) => set("email", event.target.value)}
          className={FIELD}
        />
      </Field>
      <Field label="Postal address (optional)" id="address" hint="Needed for some copyright notices.">
        <textarea
          id="address"
          name="address"
          rows={2}
          maxLength={300}
          value={draft.address}
          onChange={(event) => set("address", event.target.value)}
          className={AREA}
        />
      </Field>
      <Field label="Link to the content" id="url" hint="The address of the post or material on this server, starting with https://.">
        <input
          id="url"
          name="url"
          type="url"
          inputMode="url"
          maxLength={500}
          placeholder="https://"
          value={draft.url}
          onChange={(event) => set("url", event.target.value)}
          className={FIELD}
        />
      </Field>
      {draft.kind === "copyright" ? (
        <Field label="The work you own" id="work" hint="Its title, and where it was first published.">
          <input
            id="work"
            name="work"
            required
            maxLength={300}
            value={draft.work}
            onChange={(event) => set("work", event.target.value)}
            className={FIELD}
          />
        </Field>
      ) : null}
      <Field
        label="What is wrong with it"
        id="description"
        hint="Say what the content shows or says, where it is, and why it breaks the law or the rules. At least 20 characters."
      >
        <textarea
          id="description"
          name="description"
          required
          rows={5}
          minLength={20}
          maxLength={2000}
          value={draft.description}
          onChange={(event) => set("description", event.target.value)}
          className={AREA}
        />
      </Field>
      <label className="flex items-start gap-3 text-[14px] leading-relaxed">
        <input
          type="checkbox"
          name="good_faith"
          required
          checked={draft.good_faith}
          onChange={(event) => set("good_faith", event.target.checked)}
          className="mt-[3px] size-4 shrink-0 cursor-pointer accent-foreground"
        />
        <span>I believe in good faith that this use is not authorised by the owner, their agent or the law.</span>
      </label>
      <label className="flex items-start gap-3 text-[14px] leading-relaxed">
        <input
          type="checkbox"
          name="accurate"
          required
          checked={draft.accurate}
          onChange={(event) => set("accurate", event.target.checked)}
          className="mt-[3px] size-4 shrink-0 cursor-pointer accent-foreground"
        />
        <span>I confirm that what I have written is accurate, and that I am the owner or am authorised to act for the owner.</span>
      </label>
      <Field label="Sign with your full name" id="signature">
        <input
          id="signature"
          name="signature"
          required
          autoComplete="off"
          maxLength={100}
          value={draft.signature}
          onChange={(event) => set("signature", event.target.value)}
          className={FIELD}
        />
      </Field>
      {/* A field people do not fill in. A form that fills it is treated as a robot and goes nowhere. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Leave this empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  )
}
