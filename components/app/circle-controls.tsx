"use client"

import { useState, useTransition, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  addCircleMember,
  cancelRequest,
  createCircle,
  decideRequest,
  deleteCircle,
  joinCircle,
  leaveCircle,
  removeCircleMember,
  updateCircle,
} from "@/actions/circles"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import type { Circle } from "@/lib/circles"
import { cn } from "@/lib/utils"
import { MAX_CIRCLE_CHARTER, MAX_CIRCLE_NAME, MAX_CIRCLE_QUESTION, MAX_CIRCLE_TAGLINE, type CircleAccess } from "@/lib/rules"

const INPUT = "h-11 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"

export const ACCESS_OPTIONS: { value: CircleAccess; label: string; body: string }[] = [
  { value: "open", label: "Open", body: "Anyone can join, and anyone can read and post in it." },
  { value: "request", label: "Ask to join", body: "People answer your question, and you decide who comes in." },
  { value: "closed", label: "Invite only", body: "You add people by handle. Only members can see its posts." },
]

type Outcome = { ok: true } | { ok: false; error: string }

// Form for starting a circle, or for the owner to change one.
export function CircleForm({ circle }: { circle?: Circle }) {
  const router = useRouter()
  const [access, setAccess] = useState<CircleAccess>(circle?.access ?? "open")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      if (circle) {
        const result = await updateCircle(circle.id, formData)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(null)
        toast.success("Circle saved.")
        router.refresh()
        return
      }
      const result = await createCircle(formData)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Circle started. Invite people to it from its page.")
      router.push(`/circles/${result.slug}`)
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 px-4 py-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Name</span>
        <input
          name="name"
          required
          maxLength={MAX_CIRCLE_NAME}
          defaultValue={circle?.name}
          placeholder="Late-night bakers"
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">One line about it</span>
        <input
          name="tagline"
          maxLength={MAX_CIRCLE_TAGLINE}
          defaultValue={circle?.tagline}
          placeholder="What people come here to talk about"
          className={INPUT}
        />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">Who can join</legend>
        {ACCESS_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors",
              access === option.value ? "border-foreground/60 bg-foreground/[0.03]" : "border-border hover:bg-foreground/[0.03]"
            )}
          >
            <input
              type="radio"
              name="access"
              value={option.value}
              checked={access === option.value}
              onChange={() => setAccess(option.value)}
              className="mt-1 accent-dusk"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">{option.label}</span>
              <span className="text-sm text-muted-foreground">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {access === "request" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Question for people who ask to join</span>
          <input
            name="joinQuestion"
            maxLength={MAX_CIRCLE_QUESTION}
            defaultValue={circle?.joinQuestion}
            placeholder="What would you bring to this circle?"
            className={INPUT}
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Charter</span>
        <span className="text-sm text-muted-foreground">The circle&rsquo;s own rules. People read them before they join.</span>
        <textarea
          name="charter"
          rows={6}
          maxLength={MAX_CIRCLE_CHARTER}
          defaultValue={circle?.charter}
          placeholder="Be kind. Keep recipes in the recipes thread. No link-only posts."
          className="rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] leading-relaxed outline-none focus-visible:border-foreground/50"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="h-11 rounded-lg px-5">
          {pending ? (circle ? "Saving" : "Starting") : circle ? "Save circle" : "Start circle"}
        </Button>
      </div>
    </form>
  )
}

// What the reader can do about a circle they are not the owner of: join, ask, cancel a request, or leave.
export function CircleMembership({ circle }: { circle: Circle }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (circle.role === "owner") return null

  function run(task: () => Promise<Outcome>, done: string) {
    startTransition(async () => {
      const result = await task()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setAsking(false)
      toast.success(done)
      router.refresh()
    })
  }

  function join(answer?: string) {
    startTransition(async () => {
      const result = await joinCircle(circle.id, answer)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(null)
      setAsking(false)
      toast.success(result.state === "joined" ? `You joined ${circle.name}.` : "Request sent. The owner will answer it.")
      router.refresh()
    })
  }

  let action: ReactNode
  if (circle.role === "member") {
    action = (
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        className="h-9 rounded-full px-4 font-semibold"
        onClick={() => run(() => leaveCircle(circle.id), `You left ${circle.name}.`)}
      >
        Leave circle
      </Button>
    )
  } else if (circle.access === "closed") {
    action = <p className="text-sm text-muted-foreground">Invite only. A member can add you by handle.</p>
  } else if (circle.requested) {
    action = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">Request sent. Waiting for the owner.</p>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-9 rounded-full px-4 font-semibold"
          onClick={() => run(() => cancelRequest(circle.id), "Request cancelled.")}
        >
          Cancel request
        </Button>
      </div>
    )
  } else if (circle.access === "request") {
    action = asking ? (
      <form
        className="flex w-full flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          join(String(new FormData(event.currentTarget).get("answer") ?? ""))
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{circle.joinQuestion || "Why do you want to join?"}</span>
          <textarea
            name="answer"
            required
            rows={3}
            maxLength={500}
            className="rounded-xl border border-input bg-background px-3 py-2 text-[15px] outline-none focus-visible:border-foreground/50"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-9 rounded-full px-4" onClick={() => setAsking(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending} className="h-9 rounded-full px-4 font-semibold">
            {pending ? "Sending" : "Send request"}
          </Button>
        </div>
      </form>
    ) : (
      <Button
        type="button"
        disabled={pending}
        className="h-9 rounded-full px-4 font-semibold"
        onClick={() => (circle.joinQuestion ? setAsking(true) : join(""))}
      >
        Ask to join
      </Button>
    )
  } else {
    action = (
      <Button type="button" disabled={pending} className="h-9 rounded-full px-4 font-semibold" onClick={() => join("")}>
        Join circle
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {action}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function AddCircleMemberForm({ circleId }: { circleId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        const handle = String(new FormData(form).get("handle") ?? "")
          .trim()
          .replace(/^@/, "")
        startTransition(async () => {
          const result = await addCircleMember(circleId, handle)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setError(null)
          form.reset()
          toast.success(`Added @${handle}.`)
          router.refresh()
        })
      }}
    >
      <div className="flex gap-2">
        <input
          name="handle"
          required
          placeholder="Add a person by handle"
          aria-label="Handle"
          autoComplete="off"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <Button type="submit" disabled={pending} className="h-11 rounded-lg px-4">
          {pending ? "Adding" : "Add"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}

export function RemoveCircleMemberButton({ circleId, userId, handle }: { circleId: string; userId: string; handle: string }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" aria-label={`Remove @${handle}`} className="h-8 rounded-full px-3 text-sm">
          Remove
        </Button>
      }
      title={`Remove @${handle}?`}
      description="They leave the circle. Their posts in it stay where they are."
      confirmLabel="Remove"
      action={() => removeCircleMember(circleId, userId)}
      onDone={() => {
        toast.success(`Removed @${handle}.`)
        router.refresh()
      }}
    />
  )
}

// One person waiting to join. The owner reads the answer to the circle's question, then approves or declines.
export function CircleRequestRow({
  circleId,
  userId,
  name,
  handle,
  answer,
  question,
}: {
  circleId: string
  userId: string
  name: string
  handle: string
  answer: string
  question: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  function decide(approve: boolean) {
    startTransition(async () => {
      const result = await decideRequest(circleId, userId, approve)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(approve ? `@${handle} is in.` : `Declined @${handle}.`)
      router.refresh()
    })
  }
  return (
    <li className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <div className="flex flex-col gap-0.5">
        <Link href={`/${handle}`} className="font-semibold hover:underline">
          {name}
        </Link>
        <span className="text-sm text-muted-foreground">@{handle}</span>
      </div>
      {question ? <p className="text-sm text-muted-foreground">{question}</p> : null}
      {answer ? (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-[15px] leading-relaxed whitespace-pre-wrap">{answer}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={() => decide(true)} className="h-9 rounded-full px-4 font-semibold">
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => decide(false)}
          className="h-9 rounded-full px-4"
        >
          Decline
        </Button>
      </div>
    </li>
  )
}

export function DeleteCircleButton({ circleId, access }: { circleId: string; access: CircleAccess }) {
  const router = useRouter()
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="outline" className="h-9 rounded-lg px-4 text-destructive">
          Delete circle
        </Button>
      }
      title="Delete this circle?"
      description={
        access === "closed"
          ? "The circle is removed for everyone. Its posts are deleted too, because only its members could see them."
          : "The circle is removed. Its posts stay on Rhenko as ordinary posts."
      }
      confirmLabel="Delete circle"
      action={() => deleteCircle(circleId)}
      onDone={() => {
        toast.success("Circle deleted.")
        router.push("/circles")
      }}
    />
  )
}
