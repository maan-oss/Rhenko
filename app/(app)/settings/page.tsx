import { Suspense } from "react"
import { logout } from "@/actions/auth"
import { requireViewer } from "@/lib/auth"
import { PageHeader } from "@/components/app/page-header"
import { ProfileEditDialog } from "@/components/app/profile-edit"
import { ThemeChoice } from "@/components/app/theme-choice"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsBody />
    </Suspense>
  )
}

async function SettingsBody() {
  const viewer = await requireViewer()
  return (
    <>
      <PageHeader title="Settings" />
      <section className="flex flex-col gap-3 border-b border-border px-4 py-5">
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">Pick a theme. System follows your device.</p>
        <ThemeChoice />
      </section>
      <section className="flex flex-col gap-3 border-b border-border px-4 py-5">
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="text-[15px]">
          <span className="font-semibold">{viewer.name}</span>{" "}
          <span className="text-muted-foreground">@{viewer.handle}</span>
        </p>
        <div>
          <ProfileEditDialog
            defaults={{ name: viewer.name, bio: viewer.bio, location: viewer.location, website: viewer.website }}
          />
        </div>
      </section>
      <section className="flex flex-col gap-3 px-4 py-5">
        <h2 className="text-lg font-semibold">Session</h2>
        <p className="text-sm text-muted-foreground">Log out on this device. Your posts stay up.</p>
        <form action={logout}>
          <Button type="submit" variant="outline" className="h-9 rounded-lg px-4">
            Log out
          </Button>
        </form>
      </section>
    </>
  )
}
