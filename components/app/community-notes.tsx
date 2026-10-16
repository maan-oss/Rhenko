"use client"

import { useState, useTransition, type FormEvent } from "react"
import { ThumbsDown, ThumbsUp, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { addNote, deleteNote, rateNote } from "@/actions/notes"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { PostBody } from "@/components/app/post-body"
import { RelativeTime } from "@/components/app/time-text"
import { Button } from "@/components/ui/button"
import type { NoteView } from "@/lib/data"
import { countChars, MAX_NOTE } from "@/lib/rules"
import { cn } from "@/lib/utils"

// Community notes under a post. Anyone can add one. A note is shown to everyone once
// enough readers rate it helpful; until then it waits for ratings.
export function CommunityNotes({ postId, notes, signedIn }: { postId: string; notes: NoteView[]; signedIn: boolean }) {
  const [writing, setWriting] = useState(false)
  const mine = notes.some((note) => note.mine)

  // No notes yet: one line, so the replies are the next thing on the page. The form opens only when asked for.
  if (notes.length === 0) {
    return (
      <section id="notes" aria-label="Community notes" className="flex flex-col gap-2 border-b border-border px-4 py-2.5 scroll-mt-16">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">No community notes on this post yet.</p>
          {signedIn && !writing ? (
            <Button type="button" variant="outline" onClick={() => setWriting(true)} className="h-8 shrink-0 rounded-full px-3.5 text-[13px] font-semibold">
              Write a note
            </Button>
          ) : null}
        </div>
        {signedIn && writing ? <AddNote postId={postId} /> : null}
      </section>
    )
  }

  return (
    <section id="notes" aria-labelledby="notes-heading" className="flex flex-col gap-3 border-b border-border px-4 py-4 scroll-mt-16">
      <div className="flex flex-col gap-1">
        <h2 id="notes-heading" className="text-base font-semibold">
          Community notes
        </h2>
        <p className="text-sm text-muted-foreground">
          Added by people on Rhenko to give context. A note is shown to everyone once readers rate it helpful.
        </p>
      </div>

      <ul className="flex flex-col">
        {notes.map((note) => (
          <NoteItem key={note.id} note={note} signedIn={signedIn} />
        ))}
      </ul>

      {signedIn && !mine ? <AddNote postId={postId} /> : null}
      {mine ? <p className="text-sm text-muted-foreground">You added a note to this post.</p> : null}
    </section>
  )
}

function NoteItem({ note, signedIn }: { note: NoteView; signedIn: boolean }) {
  const [pending, startTransition] = useTransition()

  function rate(helpful: boolean) {
    startTransition(async () => {
      const result = await rateNote(note.id, helpful)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <li className="flex flex-col gap-2 border-t border-border py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-semibold">{note.author.name}</span>
        <span className="text-muted-foreground">
          @{note.author.handle} · <RelativeTime at={note.createdAt} />
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-xs font-semibold",
            note.shown ? "bg-foreground/10 text-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {note.shown ? "Shown" : "Needs more ratings"}
        </span>
      </div>
      <PostBody text={note.body} className="text-[15px]" />
      <div className="flex items-center gap-2">
        {note.mine ? (
          <ConfirmDialog
            trigger={
              <button
                type="button"
                aria-label="Delete your note"
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] text-muted-foreground hover:bg-muted"
              >
                <Trash2 className="size-3.5" /> Delete note
              </button>
            }
            title="Delete this note?"
            description="Everyone will stop seeing it, and its ratings go with it."
            confirmLabel="Delete"
            action={() => deleteNote(note.id)}
          />
        ) : (
          <>
            <RatingButton label="Helpful" count={note.helpful} active={note.myRating === true} disabled={!signedIn || pending} onClick={() => rate(true)} Icon={ThumbsUp} />
            <RatingButton label="Not helpful" count={note.unhelpful} active={note.myRating === false} disabled={!signedIn || pending} onClick={() => rate(false)} Icon={ThumbsDown} />
          </>
        )}
      </div>
    </li>
  )
}

function RatingButton({
  label,
  count,
  active,
  disabled,
  onClick,
  Icon,
}: {
  label: string
  count: number
  active: boolean
  disabled: boolean
  onClick: () => void
  Icon: typeof ThumbsUp
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] tabular-nums transition-colors disabled:opacity-60",
        active ? "border-foreground bg-foreground/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      <Icon className="size-3.5" />
      {label}
      <span>{count}</span>
    </button>
  )
}

function AddNote({ postId }: { postId: string }) {
  const [value, setValue] = useState("")
  const [pending, startTransition] = useTransition()
  const length = countChars(value)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = new FormData()
    body.set("body", value)
    startTransition(async () => {
      const result = await addNote(postId, body)
      if (result.ok) {
        setValue("")
        toast.success("Note added. It's shown once readers rate it helpful.")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="community-note" className="text-sm font-semibold">
        Add a note
      </label>
      <textarea
        id="community-note"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="Add context that helps readers understand this post"
        className="rounded-xl border border-border bg-background p-3 text-[15px] outline-none focus-visible:border-foreground/50"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={cn("text-xs tabular-nums", length > MAX_NOTE ? "text-destructive" : "text-muted-foreground")}>
          {length}/{MAX_NOTE}
        </span>
        <Button type="submit" disabled={pending || value.trim() === "" || length > MAX_NOTE} className="h-9 rounded-full px-4 font-semibold">
          {pending ? "Adding" : "Add note"}
        </Button>
      </div>
    </form>
  )
}
