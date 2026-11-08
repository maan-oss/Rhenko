"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { useSafeActionState } from "@/lib/use-safe-action-state"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { Camera } from "lucide-react"
import { updateProfile, type ProfileState } from "@/actions/social"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { PhotoCrop } from "@/components/app/photo-crop"
import { ProfileBanner } from "@/components/app/profile-banner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ANIMATED_AVATAR_MESSAGE, MAX_BIO, MAX_NAME } from "@/lib/rules"

// The profile itself: name, bio, photo and banner. Where someone is, their languages, interests and website are edited on
// About you (Settings), so they stay off the profile. A photo is framed in the crop dialog before it is kept.
type Defaults = { name: string; bio: string }
type Kind = "avatar" | "banner"
// A photo picked in this dialog and framed, shown as a preview until it is saved.
type Picked = { name: string; url: string }

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"
const FIELD =
  "h-12 w-full rounded-full bg-muted px-5 text-[15px] outline-none transition-[background-color] duration-200 placeholder:text-muted-foreground hover:bg-foreground/[0.06] focus:bg-background"

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 rounded-full px-6 font-semibold">
      {pending ? "Saving" : "Save profile"}
    </Button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </div>
  )
}

export function ProfileEditDialog({
  defaults,
  plus,
  current,
  bannerFile,
  handle,
}: {
  defaults: Defaults
  plus: boolean
  // The photo as it is saved now, shown until a new one is picked.
  current: AvatarUser
  bannerFile: string | null
  handle: string
}) {
  const [open, setOpen] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const [cropping, setCropping] = useState<{ kind: Kind; file: File } | null>(null)
  const [chosen, setChosen] = useState<{ avatar: Picked | null; banner: Picked | null }>({ avatar: null, banner: null })

  async function save(previous: ProfileState, formData: FormData): Promise<ProfileState> {
    const result = await updateProfile(previous, formData)
    if (result.ok) {
      toast.success("Profile saved.")
      setOpen(false)
    }
    return result
  }
  const [state, action] = useSafeActionState(save, {} as ProfileState)

  // A picked photo opens the framing dialog first. Only the framed part is kept, and it is handed to the form's file input.
  function pickPhoto(event: ChangeEvent<HTMLInputElement>, kind: Kind) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    // A GIF moves, and framing it would keep one still frame, so an animated profile picture is kept as it is. That is part of
    // Rhenko Plus, and the server refuses it for anyone else.
    if (kind === "avatar" && file.type === "image/gif") {
      if (!plus) toast.error(ANIMATED_AVATAR_MESSAGE)
      else keepCrop("avatar", file)
      return
    }
    setCropping({ kind, file })
  }

  function keepCrop(kind: Kind, picture: File) {
    const input = kind === "avatar" ? avatarInput.current : bannerInput.current
    const transfer = new DataTransfer()
    transfer.items.add(picture)
    if (input) input.files = transfer.files
    const url = URL.createObjectURL(picture)
    setChosen((existing) => {
      const replaced = existing[kind]
      if (replaced) URL.revokeObjectURL(replaced.url)
      return { ...existing, [kind]: { name: picture.name, url } }
    })
    setCropping(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-11 flex-1 rounded-full px-5 font-semibold" />}>Edit profile</DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-lg" showCloseButton>
        <form action={action} className="flex flex-col gap-5 p-6">
          <DialogTitle className="pr-8 text-lg font-semibold">Edit profile</DialogTitle>
          <Field label="Name">
            <input name="name" required maxLength={MAX_NAME} defaultValue={defaults.name} className={FIELD} />
          </Field>
          <Field label="Bio">
            <textarea
              name="bio"
              rows={3}
              maxLength={MAX_BIO}
              defaultValue={defaults.bio}
              className="rounded-3xl bg-muted px-5 py-3 text-[15px] outline-none transition-[background-color] duration-200 placeholder:text-muted-foreground hover:bg-foreground/[0.06] focus:bg-background"
            />
          </Field>
          <Field label="Profile photo">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                aria-label="Choose a new profile photo"
                className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="block size-24 overflow-hidden rounded-full bg-muted">
                  {chosen.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chosen.avatar.url} alt="" className="size-full object-cover" />
                  ) : (
                    <Avatar user={current} size={96} />
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-foreground text-background ring-[3px] ring-popover transition-transform duration-200 group-hover:scale-105"
                >
                  <Camera className="size-4" strokeWidth={2} />
                </span>
              </button>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{chosen.avatar ? "New photo ready" : "Current photo"}</span>
                <span className="text-[13px] text-muted-foreground">Tap the photo to choose a new one. You frame it before it is kept.</span>
              </div>
            </div>
            <input ref={avatarInput} name="avatar" type="file" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, "avatar")} />
          </Field>
          <Field label="Banner">
            <div className="relative">
              <ProfileBanner file={bannerFile} src={chosen.banner?.url ?? null} handle={handle} className="aspect-[3/1] w-full rounded-2xl" />
              <button
                type="button"
                onClick={() => bannerInput.current?.click()}
                className="absolute right-3 bottom-3 inline-flex h-9 items-center gap-2 rounded-full bg-background/90 px-3.5 text-[13px] font-semibold text-foreground shadow-sm backdrop-blur outline-none transition-colors duration-200 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Camera className="size-4" strokeWidth={2} aria-hidden="true" />
                {chosen.banner ? "Change again" : "Change banner"}
              </button>
            </div>
            <input ref={bannerInput} name="banner" type="file" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, "banner")} />
          </Field>
          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end pt-1">
            <SaveButton />
          </div>
        </form>
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
      </DialogContent>
    </Dialog>
  )
}
