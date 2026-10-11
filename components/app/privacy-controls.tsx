"use client"

import { useActionState, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { setProtected, toggleBlock, toggleMute } from "@/actions/social"
import { addMutedWord, removeMutedWord } from "@/actions/posts"
import { ErrorLine, Field, FIELD_INPUT } from "@/components/app/form-bits"
import { Button } from "@/components/ui/button"
import { pluralize } from "@/lib/format"
import { MAX_MUTED_WORD } from "@/lib/rules"
import { cn } from "@/lib/utils"

export function ProtectedSwitch({ initial }: { initial: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(initial)
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() => {
        const next = !on
        setOn(next)
        startTransition(async () => {
          const result = await setProtected(next)
          if (!result.ok) {
            setOn(!next)
            toast.error(result.error)
          } else {
            const cleared = result.cleared ?? 0
            toast.success(
              next
                ? "Your account is protected. New followers need your approval."
                : cleared > 0
                  ? `Your account is public. ${cleared} pending follow ${pluralize(cleared, "request")} cleared, and anyone can follow you now.`
                  : "Your account is public. Anyone can follow you and see your posts."
            )
            router.refresh()
          }
        })
      }}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
        on ? "border-dusk bg-dusk" : "border-border bg-muted"
      )}
    >
      <span className={cn("size-5 rounded-full bg-background shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-[3px]")} />
      <span className="sr-only">Protect my posts</span>
    </button>
  )
}

// Unblock or unmute someone from the privacy page. It works for accounts that have been deactivated since.
export function ReleaseButton({ handle, mode }: { handle: string; mode: "block" | "mute" }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      className="h-8 rounded-full px-3"
      onClick={() =>
        startTransition(async () => {
          const result = mode === "block" ? await toggleBlock(handle, false) : await toggleMute(handle, false)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success(mode === "block" ? `Unblocked @${handle}.` : `Unmuted @${handle}.`)
          router.refresh()
        })
      }
    >
      {mode === "block" ? "Unblock" : "Unmute"}
    </Button>
  )
}

type FormState = { ok?: boolean; error?: string }

export function MutedWordsPanel({ words }: { words: string[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()
  const [, action] = useActionState(
    async (_prev: FormState, formData: FormData): Promise<FormState> => {
      const word = String(formData.get("word") ?? "").trim()
      const result = await addMutedWord(word)
      if (!result.ok) {
        setError(result.error)
        return { error: result.error }
      }
      setError(undefined)
      toast.success(`Muted “${word}”. Posts with it are hidden from your feeds, search and topics.`)
      router.refresh()
      return { ok: true }
    },
    {}
  )
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Word, phrase or #hashtag">
            <input name="word" required maxLength={MAX_MUTED_WORD} placeholder="Words you'd rather not see" className={`${FIELD_INPUT} w-full`} />
          </Field>
        </div>
        <Button type="submit" className="h-11 shrink-0 rounded-lg px-4">
          Mute
        </Button>
      </form>
      <ErrorLine message={error} />
      {words.length === 0 ? (
        <p className="text-sm text-muted-foreground">Posts with muted words are hidden from your feeds, search and topics.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {words.map((word) => (
            <li key={word} className="flex items-center justify-between py-2.5">
              <span className="font-mono text-[15px]">{word}</span>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                aria-label={`Unmute ${word}`}
                className="h-8 rounded-full px-3"
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeMutedWord(word)
                    if (!result.ok) toast.error(result.error)
                    else {
                      toast.success(`Unmuted “${word}”.`)
                      router.refresh()
                    }
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
