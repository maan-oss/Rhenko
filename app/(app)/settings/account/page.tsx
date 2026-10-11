import { Suspense } from "react"
import Link from "next/link"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle } from "@/lib/data"
import { BirthdayForm, ChangeHandleForm, DeactivateForm, DeleteAccountForm } from "@/components/app/account-forms"
import { PageHeader } from "@/components/app/page-header"

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={null}>
      <AccountBody />
    </Suspense>
  )
}

async function AccountBody() {
  const viewer = await requireViewer()
  const profile = getProfileByHandle(viewer.handle, viewer.id)
  return (
    <>
      <PageHeader title="Account" backHref="/settings" />
      <Section title="Handle">
        <ChangeHandleForm handle={viewer.handle} />
      </Section>
      <Section title="Date of birth">
        <BirthdayForm birthday={profile?.birthday ?? null} />
      </Section>
      <Section title="Your data">
        <p className="text-[15px] text-muted-foreground">
          Download your profile, posts, follows, lists, and bookmarks as a JSON file. Messages are not included.
        </p>
        <div>
          <a
            href="/api/account-data"
            download
            className="inline-flex h-10 items-center rounded-lg border border-border px-4 font-semibold transition-colors hover:bg-muted"
          >
            Download your data
          </a>
        </div>
      </Section>
      <Section title="Deactivate account">
        <p className="text-[15px] text-muted-foreground">
          Your profile and posts are hidden until you sign in again. Signing in reactivates everything.
        </p>
        <DeactivateForm />
      </Section>
      <Section title="Delete account">
        <p className="text-[15px] text-muted-foreground">
          This removes your profile, posts, messages and media permanently. It can&apos;t be undone.{" "}
          <Link href="/settings/security" className="font-semibold text-dusk underline underline-offset-4">
            Review your sign-in devices first
          </Link>
          .
        </p>
        <DeleteAccountForm handle={viewer.handle} />
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
