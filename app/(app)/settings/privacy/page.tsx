import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { blockedUsers, mutedUsers, mutedWords } from "@/lib/data"
import { Avatar } from "@/components/app/avatar"
import { MutedWordsPanel, ProtectedSwitch, ReleaseButton } from "@/components/app/privacy-controls"
import { PageHeader } from "@/components/app/page-header"
import Link from "next/link"

export default function PrivacySettingsPage() {
  return (
    <Suspense fallback={null}>
      <PrivacyBody />
    </Suspense>
  )
}

async function PrivacyBody() {
  const viewer = await requireViewer()
  const blocked = blockedUsers(viewer.id)
  const muted = mutedUsers(viewer.id)
  const words = mutedWords(viewer.id)
  return (
    <>
      <PageHeader title="Privacy and safety" backHref="/settings" />
      <section className="flex items-start justify-between gap-4 border-b border-border px-4 py-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Protect your posts</h2>
          <p className="text-[15px] text-muted-foreground">
            People must send a follow request, and you approve it, before they see your posts. Your profile stays visible.
          </p>
        </div>
        <ProtectedSwitch initial={viewer.protected} />
      </section>
      <Section title="Blocked accounts" empty="Blocked people can't follow you, see your posts, or message you.">
        {blocked.map((user) => (
          <PersonRow key={user.id} user={user} action={<ReleaseButton handle={user.handle} mode="block" />} />
        ))}
      </Section>
      <Section title="Muted accounts" empty="Muted people's posts stay out of your feeds. They don't know.">
        {muted.map((user) => (
          <PersonRow key={user.id} user={user} action={<ReleaseButton handle={user.handle} mode="mute" />} />
        ))}
      </Section>
      <section className="flex flex-col gap-3 px-4 py-6">
        <h2 className="text-lg font-semibold">Muted words</h2>
        <MutedWordsPanel words={words} />
      </section>
    </>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="flex flex-col gap-2 border-b border-border px-4 py-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hasChildren ? <ul className="flex flex-col divide-y divide-border">{children}</ul> : <p className="text-[15px] text-muted-foreground">{empty}</p>}
    </section>
  )
}

function PersonRow({ user, action }: { user: { id: string; handle: string; name: string; avatarFile: string | null; verified: boolean }; action: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Link href={`/${user.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar user={user} size={40} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{user.name}</span>
          <span className="block truncate text-sm text-muted-foreground">@{user.handle}</span>
        </span>
      </Link>
      {action}
    </li>
  )
}
