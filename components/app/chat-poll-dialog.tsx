"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { ToggleSwitch } from "@/components/app/toggle-switch"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { POLL_CHOICE_MAX, POLL_CHOICES_MAX, POLL_CHOICES_MIN, POLL_QUESTION_MAX, cleanPollText } from "@/lib/poll-rules"
import { cn } from "@/lib/utils"

export type PollDraft = { question: string; choices: string[]; multiple: boolean }

const FIELD = "h-11 min-w-0 flex-1 rounded-full bg-muted px-4 text-[15px] outline-none transition-[background-color] focus:bg-background"

// Makes a poll to send in a chat: a question, two to twelve choices, and whether more than one choice may be picked. The
// form starts fresh each time the dialog opens.
export function ChatPollDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (poll: PollDraft) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Create a poll</DialogTitle>
        <DialogDescription>Everyone in this chat can vote.</DialogDescription>
        {open ? (
          <PollForm
            onCancel={() => onOpenChange(false)}
            onCreate={(poll) => {
              onCreate(poll)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PollForm({ onCreate, onCancel }: { onCreate: (poll: PollDraft) => void; onCancel: () => void }) {
  const [question, setQuestion] = useState("")
  const [choices, setChoices] = useState<string[]>(["", ""])
  const [multiple, setMultiple] = useState(false)
  const filled = choices.map((choice) => cleanPollText(choice)).filter((choice) => choice.length > 0)
  const unique = new Set(filled.map((choice) => choice.toLowerCase())).size === filled.length
  const ready = cleanPollText(question).length > 0 && filled.length >= POLL_CHOICES_MIN && unique

  return (
    <form
      className="mt-4 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!ready) return
        onCreate({ question: cleanPollText(question), choices: filled, multiple })
      }}
    >
      <input
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        maxLength={POLL_QUESTION_MAX}
        placeholder="Ask a question"
        aria-label="Question"
        autoFocus
        className="h-11 w-full min-w-0 rounded-full bg-muted px-4 text-[15px] outline-none transition-[background-color] focus:bg-background"
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] text-muted-foreground">Choices</legend>
        {choices.map((choice, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={choice}
              maxLength={POLL_CHOICE_MAX}
              onChange={(event) => setChoices((current) => current.map((item, i) => (i === index ? event.target.value : item)))}
              placeholder={`Choice ${index + 1}`}
              aria-label={`Choice ${index + 1}`}
              className={FIELD}
            />
            {choices.length > POLL_CHOICES_MIN ? (
              <button
                type="button"
                aria-label={`Remove choice ${index + 1}`}
                onClick={() => setChoices((current) => current.filter((_, i) => i !== index))}
                className="tap-44 grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
        {choices.length < POLL_CHOICES_MAX ? (
          <button
            type="button"
            onClick={() => setChoices((current) => [...current, ""])}
            className="tap-44 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-sm font-semibold transition-colors duration-200 hover:bg-foreground/5"
          >
            <Plus className="size-4" aria-hidden="true" /> Add choice
          </button>
        ) : null}
        {!unique ? <p className="text-sm text-destructive">Each choice needs its own text.</p> : null}
      </fieldset>
      <button
        type="button"
        role="switch"
        aria-checked={multiple}
        onClick={() => setMultiple((value) => !value)}
        className="tap-44 flex w-full items-center justify-between gap-4 rounded-xl px-1 py-1 text-left"
      >
        <span className="min-w-0">
          <span className="block font-semibold">Allow more than one answer</span>
          <span className="block text-sm text-muted-foreground">People can choose several choices.</span>
        </span>
        <ToggleSwitch on={multiple} />
      </button>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="tap-44 rounded-full px-4 py-2 font-semibold transition-colors hover:bg-muted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!ready}
          className={cn(
            "tap-44 rounded-full bg-foreground px-4 py-2 font-semibold text-background transition-opacity duration-200 disabled:opacity-35"
          )}
        >
          Create poll
        </button>
      </div>
    </form>
  )
}
