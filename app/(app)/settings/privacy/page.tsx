import { requireViewer } from "@/lib/auth"
import { blockedUsers, mutedUsers, mutedWords } from "@/lib/data"
import { Avatar } from "@/components/app/avatar"
import { HideCountsSwitch, MutedWordsPanel, ProtectedSwitch, ReleaseButton } from "@/components/app/privacy-controls"
import { get } from "@/lib/db"
import { encryptedChatsEnabled } from "@/lib/e2ee-chat"
import { PageHeader } from "@/components/app/page-header"
import Link from "@/components/app/link"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export default function PrivacySettingsPage() {
  return (
    <RevealSuspense>
      <PrivacyBody />
    </RevealSuspense>
  )
}

async function PrivacyBody() {
  const viewer = await requireViewer()
  const blocked = await blockedUsers(viewer.id)
  const muted = await mutedUsers(viewer.id)
  const words = await mutedWords(viewer.id)
  return (
    <>
      <PageHeader title="Privacy and safety" backHref="/settings" />
      <section className="flex items-start justify-between gap-4 border-b border-border px-4 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Protect your posts</h2>
          <p className="text-[15px] text-muted-foreground">
            People must send a follow request, and you approve it, before they see your posts. Your profile stays visible.
          </p>
        </div>
        {/* Read from the database, not the viewer, which is cached for a few seconds per worker: after a change, the switch shows the saved value. */}
        <ProtectedSwitch initial={(await get<{ prot: number }>("SELECT protected AS prot FROM users WHERE id = ?", viewer.id))?.prot === 1} />
      </section>
      <section className="flex items-start justify-between gap-4 border-b border-border px-4 py-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Hide counts on my posts</h2>
          <p className="text-[15px] text-muted-foreground">
            Likes, reposts, replies, quotes and views on your posts are hidden from everyone else. You still see them. Hiding them does not change
            who sees your posts or how they are ordered.
          </p>
        </div>
        <HideCountsSwitch initial={(await get<{ hide: number }>("SELECT hide_counts AS hide FROM users WHERE id = ?", viewer.id))?.hide === 1} />
      </section>
      {encryptedChatsEnabled() ? <EncryptedChats /> : null}
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
      <section className="flex flex-col gap-3 px-4 py-4">
        <h2 className="text-lg font-semibold">Muted words</h2>
        <MutedWordsPanel words={words} />
      </section>
    </>
  )
}

// What the server can and cannot read in encrypted chats. Shown only while encrypted chats are turned on.
function EncryptedChats() {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <h2 className="text-lg font-semibold">Encrypted chats</h2>
      <p className="text-[15px] text-muted-foreground">
        New direct and group chats are end-to-end encrypted. The text and attachments of each message are encrypted on your device before they are
        sent, and only the devices of people in the chat can open them. Rhenko stores the encrypted messages and cannot read them.
      </p>
      <p className="text-[15px] text-muted-foreground">
        Rhenko can still see who is in a chat, when messages were sent and edited, which messages are replies, pins, stars or reactions (and the emoji
        used), poll votes, whether a message was forwarded, the size of each message, and the account a shared contact refers to.
      </p>
      <p className="text-[15px] text-muted-foreground">
        Rhenko cannot see message text, attachments, locations, poll questions or options, or the contents of files. Video can&apos;t be sent in encrypted
        chats yet.
      </p>
      <p className="text-[15px] text-muted-foreground">
        A new browser can read an encrypted chat only after you link it from a device you are already signed in on. Check that the code matches the one
        the new browser shows, then approve it. Your device copies the chat keys so the new browser can read the history. Keep the approving device open
        until the copy finishes.
      </p>
      <p className="text-[15px] text-muted-foreground">
        Search and export of an encrypted chat happen on your device. Your account data download leaves out the text and attachments of encrypted
        messages, because Rhenko does not have them. If a device in a chat gets a new key, its messages are not shown and this browser says so. Signing
        out clears the chat keys from this browser.
      </p>
      <Link href="/settings/devices" className="text-[15px] font-semibold underline underline-offset-4">
        Devices and encryption
      </Link>
    </section>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="flex flex-col gap-2 border-b border-border px-4 py-4">
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
