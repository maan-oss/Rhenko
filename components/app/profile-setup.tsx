"use client"

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Camera, Check, MapPin } from "lucide-react"
import { finishSetup } from "@/actions/connections"
import { setTopicFollow, updateProfile } from "@/actions/social"
import { Avatar } from "@/components/app/avatar"
import { OnboardingSteps } from "@/components/app/onboarding-steps"
import { RhenkoR } from "@/components/brand/symbol"
import { MAX_BIO, MAX_LOCATION, MAX_NAME } from "@/lib/rules"
import { cn } from "@/lib/utils"

// The last onboarding screen: the profile as people will see it. Each part is edited where it sits, so there are no
// pages in between. Open Rhenko saves everything and opens Home; Skip leaves setup open for later. Interests save as
// they are picked, the same as anywhere else in the app.

export type ProfileStart = {
  name: string
  handle: string
  bio: string
  location: string
  website: string
  avatarFile: string | null
  bannerFile: string | null
  topics: string[]
}

// Topics a new account can follow. Each is a plain hashtag, the same as one written in a post.
const TOPICS = [
  "music", "food", "travel", "books", "film", "sport", "art", "tech", "science", "nature",
  "photography", "gaming", "fitness", "business", "health", "news", "history", "languages", "parenting", "money",
]

const STEP_COUNT = 4
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

const PRIMARY =
  "flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
const GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"

// A field that reads as plain text until someone points at it. Hover and focus show a light well, and focus adds a ring.
const INLINE =
  "w-full rounded-lg bg-transparent px-2 -mx-2 py-1 outline-none transition-colors duration-200 placeholder:text-muted-foreground/70 hover:bg-foreground/5 focus:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-dusk/40"

export function ProfileSetup({ initial }: { initial: ProfileStart }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [bio, setBio] = useState(initial.bio)
  const [location, setLocation] = useState(initial.location)
  const [topics, setTopics] = useState(() => new Set(initial.topics))
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)

  // A picked photo shows at once, and the file itself goes with the form. Each preview is released when it is replaced.
  useEffect(() => () => {
    if (avatarUrl) URL.revokeObjectURL(avatarUrl)
  }, [avatarUrl])
  useEffect(() => () => {
    if (bannerUrl) URL.revokeObjectURL(bannerUrl)
  }, [bannerUrl])

  function pickPhoto(event: ChangeEvent<HTMLInputElement>, show: (url: string) => void) {
    const file = event.target.files?.[0]
    if (file) show(URL.createObjectURL(file))
  }

  // Saves the profile, then the setup, then opens Home. A refused value stays on screen with the reason.
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const saved = await updateProfile({}, formData)
      if (saved.error) return setError(saved.error)
      const finished = await finishSetup("done")
      if (!finished.ok) return setError(finished.error)
      router.push("/")
      router.refresh()
    })
  }

  function skip() {
    setError(null)
    router.push("/")
  }

  // A topic is followed as it is picked. A refused one goes back the way it was.
  function toggleTopic(tag: string) {
    const following = topics.has(tag)
    setError(null)
    setTopics((current) => {
      const next = new Set(current)
      if (following) next.delete(tag)
      else next.add(tag)
      return next
    })
    startTransition(async () => {
      const result = await setTopicFollow(tag, !following)
      if (!result.ok) {
        setError(result.error)
        setTopics((current) => {
          const next = new Set(current)
          if (following) next.add(tag)
          else next.delete(tag)
          return next
        })
      }
    })
  }

  const bannerShown = bannerUrl ?? (initial.bannerFile ? `/media/${initial.bannerFile}?w=1280` : null)

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={STEP_COUNT - 1} total={STEP_COUNT} />

      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Set up your profile</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">This is how people see you. Tap anything to change it.</p>
      </div>

      <form onSubmit={save} className="flex flex-col gap-8">
        <div className="overflow-hidden bg-card max-sm:-mx-6 sm:rounded-2xl sm:border sm:border-border">
          <div className="relative h-36 overflow-hidden bg-muted sm:h-44">
            {bannerShown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerShown} alt="" className="size-full object-cover" />
            ) : (
              <RhenkoR className="absolute -top-6 -right-10 size-44 text-foreground opacity-[0.06]" />
            )}
            <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_30%,var(--card)_100%)]" />
            <button
              type="button"
              onClick={() => bannerInput.current?.click()}
              className="glass absolute top-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-foreground transition-colors duration-200 hover:bg-foreground/5"
            >
              <Camera className="size-4" aria-hidden="true" />
              {bannerShown ? "Change banner" : "Add banner"}
            </button>
          </div>

          <div className="px-6 pb-6 sm:px-5">
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              aria-label="Change profile photo"
              className="group relative -mt-14 block size-28 rounded-full ring-4 ring-card focus-visible:outline-2 focus-visible:outline-dusk"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="size-full rounded-full object-cover" />
              ) : (
                <Avatar user={{ id: "self", name: name.trim() || initial.handle, avatarFile: initial.avatarFile }} size={112} />
              )}
              <span
                aria-hidden="true"
                className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full bg-foreground text-background shadow-md transition-transform duration-200 group-hover:scale-105"
              >
                <Camera className="size-4" />
              </span>
            </button>

            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-col">
                <input
                  aria-label="Name"
                  name="name"
                  required
                  maxLength={MAX_NAME}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  className={cn(INLINE, "text-2xl leading-tight font-semibold tracking-tight")}
                />
                <span className="text-[15px] text-muted-foreground">@{initial.handle}</span>
              </div>

              <div className="flex flex-col gap-1">
                <textarea
                  aria-label="Bio"
                  name="bio"
                  rows={2}
                  maxLength={MAX_BIO}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Add a bio. One line about you is enough."
                  className={cn(INLINE, "resize-none text-[15px] leading-relaxed [field-sizing:content]")}
                />
                {bio.length >= 120 ? (
                  <span className="self-end text-[12px] tabular-nums text-muted-foreground">
                    {bio.length}/{MAX_BIO}
                  </span>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-[14px] text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden="true" />
                <input
                  aria-label="Location"
                  name="location"
                  maxLength={MAX_LOCATION}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Add where you are"
                  className={cn(INLINE, "min-w-0 flex-1 text-[14px] text-foreground")}
                />
              </label>
            </div>
          </div>
        </div>

        <input ref={avatarInput} type="file" name="avatar" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, setAvatarUrl)} />
        <input ref={bannerInput} type="file" name="banner" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, setBannerUrl)} />
        <input type="hidden" name="website" value={initial.website} />

        <section aria-labelledby="interests-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="interests-title" className="text-[15px] font-semibold">
              Interests
            </h2>
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {topics.size === 0 ? "These fill your feed. Pick as many as you like." : `${topics.size} picked. These fill your feed.`}
            </p>
          </div>
          <div role="group" aria-labelledby="interests-title" className="flex flex-wrap gap-2">
            {TOPICS.map((tag) => (
              <Chip key={tag} on={topics.has(tag)} disabled={pending} onClick={() => toggleTopic(tag)}>
                #{tag}
              </Chip>
            ))}
          </div>
        </section>

        {error ? (
          <p role="alert" className="settle rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[14px] leading-snug text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Opening…" : "Open Rhenko"}
          </button>
          <button type="button" onClick={skip} disabled={pending} className={GHOST}>
            Skip for now
          </button>
        </div>
      </form>
    </div>
  )
}

// A topic chip. A chosen one fills in with a check.
function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95 disabled:opacity-60",
        on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/30 hover:bg-foreground/5"
      )}
    >
      {on ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}
