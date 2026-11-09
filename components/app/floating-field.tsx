import type { InputHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

// The one field shape the onboarding uses: a full-shape box, the same as the birthday field. Its label sits in the middle while
// the field is empty, and rises to the top edge once the person focuses it or types. The input keeps a placeholder of a single
// space, which is what lets the label know whether it is empty, so no example text is ever shown.
export const FIELD_INPUT =
  "peer block h-16 w-full min-w-0 rounded-[20px] border border-border bg-card px-5 pt-5 text-[17px] text-foreground outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 focus-visible:border-foreground/55 focus-visible:shadow-[0_0_0_4px_rgb(31_29_25/0.08)] aria-[invalid=true]:border-destructive"

export const FIELD_LABEL =
  "pointer-events-none absolute left-5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[17px] leading-6 text-muted-foreground transition-[top,translate,font-size,line-height] duration-200 peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[13px] peer-focus:leading-4 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[13px] peer-[:not(:placeholder-shown)]:leading-4"

// A problem is plain red text under what it is about, lined up with the text inside the fields. It is not a box of its own.
export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="px-5 text-[14px] leading-snug text-destructive">
      {message}
    </p>
  )
}

// A labelled field. `optional` puts "(optional)" in brackets after the label. `prefix` is a fixed character at the start of the
// text (the @ in a handle). `trailing` is a control placed inside the box at its end (the show-password button).
export function FloatingInput({
  id,
  label,
  optional = false,
  prefix,
  trailing,
  error,
  help,
  aside,
  className,
  ...input
}: {
  id: string
  label: string
  optional?: boolean
  prefix?: string
  trailing?: ReactNode
  error?: string | null
  help?: ReactNode
  aside?: ReactNode
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          id={id}
          {...input}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          className={cn(FIELD_INPUT, prefix && "pl-10", trailing && "pr-14", className)}
        />
        {prefix ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center pt-5 pl-5 text-[17px] text-muted-foreground opacity-0 transition-opacity duration-200 peer-focus:opacity-100 peer-[:not(:placeholder-shown)]:opacity-100"
          >
            {prefix}
          </span>
        ) : null}
        <label htmlFor={id} className={FIELD_LABEL}>
          {label}
          {optional ? <span>(optional)</span> : null}
        </label>
        {trailing}
      </div>
      {error ? (
        <ErrorText message={error} />
      ) : help || aside ? (
        <div className="flex items-start justify-between gap-3 px-5 text-[13px] leading-snug text-muted-foreground">
          <div>{help}</div>
          {aside}
        </div>
      ) : null}
    </div>
  )
}
