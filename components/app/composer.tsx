"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from "react"
import { motion } from "motion/react"
import { Image as ImageIcon, X } from "lucide-react"
import { toast } from "sonner"
import { createPost } from "@/actions/posts"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MAX_POST, MAX_UPLOAD_BYTES, countChars } from "@/lib/rules"

type ComposerProps = {
  viewer: AvatarUser
  replyToId?: string
  quoteOfId?: string
  placeholder: string
  id?: string
  compact?: boolean
  autoFocus?: boolean
  onPosted?: () => void
}

function CountRing({ progress, over }: { progress: number; over: boolean }) {
  const radius = 9
  const circumference = 2 * Math.PI * radius
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx={11} cy={11} r={radius} fill="none" strokeWidth={2} className="stroke-border" />
      <motion.circle
        cx={11}
        cy={11}
        r={radius}
        fill="none"
        strokeWidth={2}
        strokeDasharray={circumference}
        transform="rotate(-90 11 11)"
        className={over ? "stroke-destructive" : "stroke-dusk"}
        animate={{ strokeDashoffset: circumference * (1 - progress) }}
        initial={false}
        transition={{ duration: 0.25, ease: "easeOut" }}
      />
    </svg>
  )
}

export function Composer({ viewer, replyToId, quoteOfId, placeholder, id, compact = false, autoFocus = false, onPosted }: ComposerProps) {
  const [text, setText] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  const [pending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const count = countChars(text)
  const remaining = MAX_POST - count
  const over = remaining < 0
  const canPost = (count > 0 || file !== null) && !over && !pending

  useEffect(() => {
    if (autoFocus || (id && window.location.hash === `#${id}`)) textareaRef.current?.focus()
  }, [autoFocus, id])

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ""
    if (!picked) return
    if (!picked.type.startsWith("image/")) return toast.error("Choose an image file.")
    if (picked.size > MAX_UPLOAD_BYTES) return toast.error("Images can be up to 4 MB.")
    setFile(picked)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canPost) return
    const body = new FormData()
    body.set("body", text)
    if (replyToId) body.set("replyTo", replyToId)
    if (quoteOfId) body.set("quoteOf", quoteOfId)
    if (file) body.set("image", file)
    startTransition(async () => {
      const result = await createPost(body)
      if (result.ok) {
        setText("")
        setFile(null)
        toast.success(replyToId ? "Reply posted." : quoteOfId ? "Quote posted." : "Posted.")
        onPosted?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form
      id={id}
      onSubmit={submit}
      className={cn("flex gap-3", compact ? "" : "border-b border-border px-4 py-3")}
    >
      <Avatar user={viewer} size={40} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          aria-label="Post text"
          rows={2}
          className="field-sizing-content min-h-12 w-full resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        {preview ? (
          <div className="relative w-fit max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Selected image" className="max-h-72 rounded-lg border border-border object-cover" />
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remove image"
              className="absolute top-2 right-2 grid size-7 place-items-center rounded-full border border-border bg-background text-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Add image"
            className="grid size-9 place-items-center rounded-lg text-dusk hover:bg-muted"
          >
            <ImageIcon className="size-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onPick}
          />
          <div className="ml-auto flex items-center gap-3">
            {count > 0 ? <CountRing progress={Math.min(count / MAX_POST, 1)} over={over} /> : null}
            {count > 0 && remaining <= 20 ? (
              <span className={cn("text-sm tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>
                {remaining}
              </span>
            ) : null}
            <Button type="submit" disabled={!canPost} className="h-9 rounded-full px-5 font-semibold">
              {pending ? "Posting" : replyToId ? "Reply" : quoteOfId ? "Quote" : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
