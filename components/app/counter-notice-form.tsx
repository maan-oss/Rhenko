"use client"

import { useState, type ReactNode } from "react"
import { useSafeActionState } from "@/lib/use-safe-action-state"
import { useFormStatus } from "react-dom"
import { submitCounterNotice, type CounterState } from "@/actions/legal"

const FIELD =
  "h-11 w-full min-w-0 rounded-2xl border border-border bg-background px-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"
const AREA =
  "w-full min-w-0 rounded-2xl border border-border bg-background px-4 py-3 text-[15px] leading-relaxed outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"

type Draft = {
  name: string
  address: string
  phone: string
  signature: string
  mistake: boolean
  consent: boolean
}

const EMPTY: Draft = { name: "", address: "", phone: "", signature: "", mistake: false, consent: false }

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 w-full rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-85 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send counter-notice"}
    </button>
  )
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}
      </label>
      {children}
    </div>
  )
}

function day(time: number): string {
  return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}

// The author of a post removed for copyright answers the copyright notice with a counter-notice (17 U.S.C. 512(g)). The owner gets it in
// full, with the name, address and telephone number here, as the law requires. The post goes back 10 to 14 business days after it arrives,
// unless the owner says it has started a court action.
export function CounterNoticeForm({ noticeId }: { noticeId: string }) {
  const [state, formAction] = useSafeActionState(submitCounterNotice, {} as CounterState)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const id = (name: string) => `counter-${noticeId}-${name}`
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  if (state.ok && state.restoreFrom !== undefined && state.restoreBy !== undefined) {
    return (
      <div role="status" className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-[15px] font-semibold">Your counter-notice is in.</p>
        <p className="text-[15px] leading-relaxed">
          We have sent it to the owner. The post goes back no sooner than {day(state.restoreFrom)} and no later than {day(state.restoreBy)},
          unless the owner tells us it has started a court action.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 border-t border-border pt-4">
      <div className="flex flex-col gap-1">
        <h4 className="text-[15px] font-semibold">Send a counter-notice</h4>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          Use this if you believe the post was removed by mistake, or because it was misidentified. We send your name, address, telephone
          number and this statement to the owner who made the copyright notice. The post goes back 10 to 14 business days after it arrives,
          unless the owner tells us it has started a court action.
        </p>
      </div>
      <input type="hidden" name="notice" value={noticeId} />
      <Field label="Your full name" id={id("name")}>
        <input
          id={id("name")}
          name="name"
          required
          autoComplete="name"
          maxLength={100}
          value={draft.name}
          onChange={(event) => set("name", event.target.value)}
          className={FIELD}
        />
      </Field>
      <Field label="Postal address" id={id("address")}>
        <textarea
          id={id("address")}
          name="address"
          required
          rows={2}
          maxLength={300}
          value={draft.address}
          onChange={(event) => set("address", event.target.value)}
          className={AREA}
        />
      </Field>
      <Field label="Telephone" id={id("phone")}>
        <input
          id={id("phone")}
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          maxLength={30}
          value={draft.phone}
          onChange={(event) => set("phone", event.target.value)}
          className={FIELD}
        />
      </Field>
      <label className="flex items-start gap-3 text-[14px] leading-relaxed">
        <input
          type="checkbox"
          name="mistake"
          required
          checked={draft.mistake}
          onChange={(event) => set("mistake", event.target.checked)}
          className="mt-[3px] size-4 shrink-0 cursor-pointer accent-foreground"
        />
        <span>Under penalty of perjury, I believe the post was removed by mistake, or because it was misidentified.</span>
      </label>
      <label className="flex items-start gap-3 text-[14px] leading-relaxed">
        <input
          type="checkbox"
          name="consent"
          required
          checked={draft.consent}
          onChange={(event) => set("consent", event.target.checked)}
          className="mt-[3px] size-4 shrink-0 cursor-pointer accent-foreground"
        />
        <span>
          I consent to the jurisdiction of the federal district court for my address, and I will accept service of process from the person who
          sent the notice.
        </span>
      </label>
      <Field label="Sign with your full name" id={id("signature")}>
        <input
          id={id("signature")}
          name="signature"
          required
          autoComplete="off"
          maxLength={100}
          value={draft.signature}
          onChange={(event) => set("signature", event.target.value)}
          className={FIELD}
        />
      </Field>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  )
}
