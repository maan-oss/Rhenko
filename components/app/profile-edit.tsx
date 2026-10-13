"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { updateProfile, type ProfileState } from "@/actions/social"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MAX_BIO, MAX_LOCATION, MAX_NAME, MAX_WEBSITE } from "@/lib/rules"

type Defaults = { name: string; bio: string; location: string; website: string }

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif"

function SaveButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-10 rounded-lg px-5">
      {pending ? "Saving" : "Save profile"}
    </Button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </div>
  )
}

const INPUT = "h-11 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"

export function ProfileEditDialog({ defaults }: { defaults: Defaults }) {
  const [open, setOpen] = useState(false)
  async function save(previous: ProfileState, formData: FormData): Promise<ProfileState> {
    const result = await updateProfile(previous, formData)
    if (result.ok) {
      toast.success("Profile saved.")
      setOpen(false)
    }
    return result
  }
  const [state, action] = useActionState(save, {} as ProfileState)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-9 rounded-lg px-4" />}>Edit profile</DialogTrigger>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-lg" showCloseButton>
        <form action={action} className="flex flex-col gap-4 p-5">
          <DialogTitle className="pr-8 text-lg font-semibold">Edit profile</DialogTitle>
          <Field label="Name">
            <input name="name" required maxLength={MAX_NAME} defaultValue={defaults.name} className={INPUT} />
          </Field>
          <Field label="Bio">
            <textarea
              name="bio"
              rows={3}
              maxLength={MAX_BIO}
              defaultValue={defaults.bio}
              className="rounded-xl border border-input bg-background px-3 py-2 text-[15px] outline-none focus-visible:border-foreground/50"
            />
          </Field>
          <Field label="Location">
            <input name="location" maxLength={MAX_LOCATION} defaultValue={defaults.location} className={INPUT} />
            <span className="text-[13px] text-muted-foreground">
              Shown on your profile, in any words you like. The city used for suggestions is private, and is set in Settings.
            </span>
          </Field>
          <Field label="Website">
            <input name="website" type="url" maxLength={MAX_WEBSITE} placeholder="https://" defaultValue={defaults.website} className={INPUT} />
          </Field>
          <Field label="Profile photo">
            <input name="avatar" type="file" accept={FILE_ACCEPT} className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5" />
          </Field>
          <Field label="Banner">
            <input name="banner" type="file" accept={FILE_ACCEPT} className="text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-1.5" />
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
      </DialogContent>
    </Dialog>
  )
}
