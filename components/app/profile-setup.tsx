"use client"

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Camera } from "lucide-react"
import { updateProfile } from "@/actions/social"
import { Avatar } from "@/components/app/avatar"
import { OnboardingSteps, SETUP_STEPS } from "@/components/app/onboarding-steps"
import { PhotoCrop } from "@/components/app/photo-crop"
import { ProfileBanner } from "@/components/app/profile-banner"
import { MAX_BIO, MAX_NAME } from "@/lib/rules"
import { cn } from "@/lib/utils"

// The first setup screen: the profile as people will see it. Each part is edited where it sits. Continue saves it and
// moves on to About you. Skip leaves setup open for later, and opens Home.

export type ProfileStart = {
  name: string
  handle: string
  bio: string
  avatarFile: string | null
  bannerFile: string | null
}

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

const PRIMARY =
  "flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
const GHOST =
  "h-11 w-full rounded-full text-[15px] font-semibold text-muted-foreground transition-colors duration-200 hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"

// A field that reads as plain text until someone points at it. Hover and focus show a light well, and focus adds a ring.
const INLINE =
  "w-full rounded-lg bg-transparent px-2 -mx-2 py-1 outline-none transition-colors duration-200 placeholder:text-muted-foreground/70 hover:bg-foreground/5 focus:bg-foreground/5"

export function ProfileSetup({ initial }: { initial: ProfileStart }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const [cropping, setCropping] = useState<{ kind: "avatar" | "banner"; file: File } | null>(null)

  // A picked photo shows at once, and the file itself goes with the form. Each preview is released when it is replaced.
  useEffect(() => () => {
    if (avatarUrl) URL.revokeObjectURL(avatarUrl)
  }, [avatarUrl])
  useEffect(() => () => {
    if (bannerUrl) URL.revokeObjectURL(bannerUrl)
  }, [bannerUrl])

  // A picked photo opens the framing dialog first. Only the framed part is kept, and it goes with the form.
  function pickPhoto(event: ChangeEvent<HTMLInputElement>, kind: "avatar" | "banner") {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) setCropping({ kind, file })
  }

  function keepCrop(kind: "avatar" | "banner", picture: File) {
    const input = kind === "avatar" ? avatarInput.current : bannerInput.current
    const transfer = new DataTransfer()
    transfer.items.add(picture)
    if (input) input.files = transfer.files
    const url = URL.createObjectURL(picture)
    if (kind === "avatar") setAvatarUrl(url)
    else setBannerUrl(url)
    setCropping(null)
  }

  // Saves the profile, then opens About you. A refused value stays on screen with the reason.
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const saved = await updateProfile({}, formData)
      if (saved.error) return setError(saved.error)
      router.push("/welcome/location")
    })
  }

  // Skip leaves setup open, so Home offers it again later.
  function skip() {
    setError(null)
    router.push("/")
  }

  return (
    <div className="flex flex-col gap-8">
      <OnboardingSteps current={SETUP_STEPS.profile} total={SETUP_STEPS.total} />

      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Set up your profile</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">This is how people see you. Tap anything to change it.</p>
      </div>

      <form onSubmit={save} className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <ProfileBanner file={initial.bannerFile} src={bannerUrl} handle={initial.handle} className="h-36 sm:h-44">
            <button
              type="button"
              onClick={() => bannerInput.current?.click()}
              className="glass absolute top-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-foreground transition-colors duration-200 hover:bg-foreground/5"
            >
              <Camera className="size-4" aria-hidden="true" />
              {bannerUrl || initial.bannerFile ? "Change banner" : "Add banner"}
            </button>
          </ProfileBanner>

          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => avatarInput.current?.click()}
              aria-label="Change profile photo"
              className="group relative -mt-16 block size-28 rounded-full bg-background p-1.5"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="size-full rounded-full object-cover" />
              ) : (
                <Avatar user={{ id: "self", name: name.trim() || initial.handle, avatarFile: initial.avatarFile }} size={112} />
              )}
              <span
                aria-hidden="true"
                className="absolute right-1.5 bottom-1.5 grid size-9 place-items-center rounded-full bg-foreground text-background shadow-md transition-transform duration-200 group-hover:scale-105"
              >
                <Camera className="size-4" />
              </span>
            </button>

            <div className="flex flex-col gap-4">
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
              <BioField initial={initial.bio} />
            </div>
          </div>
        </div>

        <input ref={avatarInput} type="file" name="avatar" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, "avatar")} />
        <input ref={bannerInput} type="file" name="banner" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, "banner")} />
        {cropping ? (
          <PhotoCrop
            key={`${cropping.kind}-${cropping.file.name}-${cropping.file.size}`}
            file={cropping.file}
            title={cropping.kind === "avatar" ? "Position your photo" : "Position your banner"}
            aspect={cropping.kind === "avatar" ? 1 : 3}
            onCancel={() => setCropping(null)}
            onApply={(picture) => keepCrop(cropping.kind, picture)}
          />
        ) : null}

        {error ? (
          <p role="alert" className="settle rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-[14px] leading-snug text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Saving…" : "Continue"}
          </button>
          <button type="button" onClick={skip} disabled={pending} className={GHOST}>
            Skip for now
          </button>
        </div>
      </form>
    </div>
  )
}

// The bio, with a count once it passes 120 characters. It grows with its text.
function BioField({ initial }: { initial: string }) {
  const [bio, setBio] = useState(initial)
  return (
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
  )
}
