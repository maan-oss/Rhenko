"use client"

import { useState, useTransition } from "react"
import { translateMessage, translatePost } from "@/actions/translate"
import { useViewerLanguages } from "@/components/app/viewer-languages"
import { languageName } from "@/lib/languages"

type View =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "translated"; text: string; source: string; showing: boolean }

// Offered under a post or message written in a language the reader does not speak, and only when this server has
// translation set up. Nothing is translated until the reader asks, and the original is always one tap away.
export function TranslateControl({ kind, id, lang }: { kind: "post" | "message"; id: string; lang: string }) {
  const { speaks, translate } = useViewerLanguages()
  const [view, setView] = useState<View>({ status: "idle" })
  const [pending, startTransition] = useTransition()
  if (!translate || lang === "" || speaks.includes(lang)) return null

  function ask() {
    startTransition(async () => {
      const result = kind === "post" ? await translatePost(id) : await translateMessage(id)
      if (result.ok) setView({ status: "translated", text: result.text, source: result.source, showing: true })
      else setView({ status: "error", error: result.error })
    })
  }

  if (view.status === "translated") {
    const from = languageName(view.source)
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-2xl border border-border px-3.5 py-3">
        <p className="text-[13px] text-muted-foreground">{from ? `Translated from ${from}` : "Translated"}</p>
        <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">{view.text}</p>
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      <button
        type="button"
        onClick={ask}
        disabled={pending}
        className="w-fit text-sm font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
      >
        {pending ? "Translating" : view.status === "error" ? "Try again" : "Translate"}
      </button>
      {view.status === "error" ? (
        <p role="alert" className="text-[13px] text-destructive">
          {view.error}
        </p>
      ) : null}
    </div>
  )
}
