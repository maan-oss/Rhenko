"use client"

import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { useSafeActionState } from "@/lib/use-safe-action-state"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { Camera, X } from "lucide-react"
import { updateProfile, type ProfileState } from "@/actions/social"
import { Avatar, type AvatarUser } from "@/components/app/avatar"
import { PhotoCrop } from "@/components/app/photo-crop"
import { ProfileBanner } from "@/components/app/profile-banner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ANIMATED_AVATAR_MESSAGE, MAX_BIO, MAX_NAME } from "@/lib/rules"

// The profile itself: name, bio, photo and banner. Where someone is, their languages, interests and website are edited on
// About you (Settings), so they stay off the profile. A photo is framed in the crop dialog before it is kept.
//
// On a phone the editor fills the screen, as X's does; on a computer it is a dialog in the middle. Save is in the header.
type Defaults = { name: string; bio: string }
type Kind = "avatar" | "banner"
// A photo picked in this dialog and framed, shown as a preview until it is saved.
type Picked = { name: string; url: string }

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"
const INPUT = "w-full bg-transparent text-[17px] outline-none placeholder:text-muted-foreground"

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-9 rounded-full bg-foreground px-4 text-[14px] font-semibold text-background hover:bg-foreground/90 max-sm:h-9"
    >
      {pending ? "Saving" : "Save"}
    </Button>
  )
}

// A field is one bordered box with its label small above the value, as X's edit screens draw them.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 rounded-2xl border border-border px-4 py-2.5 transition-colors duration-200 focus-within:border-foreground">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </label>
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
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px] max-sm:top-0 max-sm:right-0 max-sm:bottom-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:pb-[env(safe-area-inset-bottom)] max-sm:data-open:zoom-in-100 max-sm:data-closed:zoom-out-100"
      >
        <form id="profile-form" action={action} className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-2">
            <DialogClose aria-label="Close" render={<Button variant="ghost" size="icon" className="size-10 text-foreground" />}>
              <X className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </DialogClose>
            <DialogTitle className="text-[17px] font-semibold">Edit profile</DialogTitle>
            <SaveButton />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-5 p-4 sm:p-6">
              <div className="relative">
                <ProfileBanner file={bannerFile} src={chosen.banner?.url ?? null} handle={handle} className="aspect-[3/1] w-full rounded-2xl" />
                <button
                  type="button"
                  onClick={() => bannerInput.current?.click()}
                  aria-label="Change banner"
                  className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-foreground/70 text-background outline-none transition-colors duration-200 hover:bg-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Camera className="size-5" strokeWidth={1.8} aria-hidden="true" />
                </button>
                <input ref={bannerInput} name="banner" type="file" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, "banner")} />
              </div>

              <div className="-mt-12 pl-1">
                <button
                  type="button"
                  onClick={() => avatarInput.current?.click()}
                  aria-label="Change profile photo"
                  className="group relative grid size-24 place-items-center overflow-hidden rounded-full ring-4 ring-popover outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {chosen.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={chosen.avatar.url} alt="" className="size-full object-cover" />
                  ) : (
                    <Avatar user={current} size={96} />
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 grid place-items-center bg-foreground/35 text-background transition-colors duration-200 group-hover:bg-foreground/45"
                  >
                    <Camera className="size-6" strokeWidth={1.8} />
                  </span>
                </button>
                <input ref={avatarInput} name="avatar" type="file" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, "avatar")} />
              </div>

              <Field label="Name">
                <input name="name" required maxLength={MAX_NAME} defaultValue={defaults.name} className={INPUT} />
              </Field>
              <Field label="Bio">
                <textarea name="bio" rows={3} maxLength={MAX_BIO} defaultValue={defaults.bio} className={`${INPUT} resize-none`} />
              </Field>

              {state.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {state.error}
                </p>
              ) : null}
            </div>
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
