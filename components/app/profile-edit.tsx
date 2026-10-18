"use client"

import { useActionState, useRef, useState, type ChangeEvent } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { updateProfile, type ProfileState } from "@/actions/social"
import { PhotoCrop } from "@/components/app/photo-crop"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MAX_BIO, MAX_NAME } from "@/lib/rules"

// The profile itself: name, bio, photo and banner. Where someone is, their languages, interests and website are edited on
// About you (Settings), so they stay off the profile. A photo is framed in the crop dialog before it is kept.
type Defaults = { name: string; bio: string }
type Kind = "avatar" | "banner"

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

export function ProfileEditDialog({ defaults }: { defaults: Defaults }) {
  const [open, setOpen] = useState(false)
  const avatarInput = useRef<HTMLInputElement>(null)
  const bannerInput = useRef<HTMLInputElement>(null)
  const [cropping, setCropping] = useState<{ kind: Kind; file: File } | null>(null)
  const [chosen, setChosen] = useState<{ avatar: string | null; banner: string | null }>({ avatar: null, banner: null })

  async function save(previous: ProfileState, formData: FormData): Promise<ProfileState> {
    const result = await updateProfile(previous, formData)
    if (result.ok) {
      toast.success("Profile saved.")
      setOpen(false)
    }
    return result
  }
  const [state, action] = useActionState(save, {} as ProfileState)

  // A picked photo opens the framing dialog first. Only the framed part is kept, and it is handed to the form's file input.
  function pickPhoto(event: ChangeEvent<HTMLInputElement>, kind: Kind) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (file) setCropping({ kind, file })
  }

  function keepCrop(kind: Kind, picture: File) {
    const input = kind === "avatar" ? avatarInput.current : bannerInput.current
    const transfer = new DataTransfer()
    transfer.items.add(picture)
    if (input) input.files = transfer.files
    setChosen((current) => ({ ...current, [kind]: picture.name }))
    setCropping(null)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-11 flex-1 rounded-full px-5 font-semibold" />}>Edit profile</DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-lg" showCloseButton>
        <form action={action} className="flex flex-col gap-4 p-6">
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                className="h-11 rounded-full border border-border px-5 text-[14px] font-semibold transition-colors hover:bg-foreground/5"
              >
                Choose a photo
              </button>
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">{chosen.avatar ?? "Keeps your current photo"}</span>
            </div>
            <input ref={avatarInput} name="avatar" type="file" accept={FILE_ACCEPT} tabIndex={-1} className="hidden" onChange={(event) => pickPhoto(event, "avatar")} />
          </Field>
          <Field label="Banner">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => bannerInput.current?.click()}
                className="h-11 rounded-full border border-border px-5 text-[14px] font-semibold transition-colors hover:bg-foreground/5"
              >
                Choose a banner
              </button>
              <span className="min-w-0 truncate text-[13px] text-muted-foreground">{chosen.banner ?? "Keeps your current banner"}</span>
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
