import { Suspense } from "react"
import { requireViewer } from "@/lib/auth"
import { getProfileByHandle } from "@/lib/data"
import { codeNeedFor, emailSettingsFor } from "@/lib/settings-data"
import {
  BirthdayForm,
  ChangeHandleForm,
  DataExportButton,
  DeactivateForm,
  DeleteAccountForm,
} from "@/components/app/account-forms"
import { EmailPanel } from "@/components/app/email-panel"
import { StatusForm } from "@/components/app/status-form"
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
  const profile = await getProfileByHandle(viewer.handle, viewer.id)
  const email = await emailSettingsFor(viewer.id)
  const codeNeed = await codeNeedFor(viewer.id)
  return (
    <>
      <PageHeader title="Account" backHref="/settings" />
      <Section title="Status">
        <StatusForm status={viewer.status} />
      </Section>
      <Section title="Email">
        <EmailPanel email={email.email} verified={email.verified} pending={email.pending} ready={email.ready} codeNeed={codeNeed} />
      </Section>
      <Section title="Handle">
        <ChangeHandleForm handle={viewer.handle} />
      </Section>
      <Section title="Date of birth">
        <BirthdayForm birthday={profile?.birthday ?? null} />
      </Section>
      <Section title="Your data" id="your-data">
        <p className="text-[15px] text-muted-foreground">A ZIP file with two parts:</p>
        <ul className="flex flex-col gap-2 text-[15px] text-muted-foreground">
          <li>
            <span className="font-mono text-[14px] text-foreground">data.json</span>: your profile and email, every post
            and reply you wrote (each marked draft, scheduled or published), likes, reposts, bookmarks with their folders,
            highlights, who you follow and who follows you, follow requests, blocked and muted accounts, muted words, lists
            you made and lists you follow, topics you follow, poll votes, notes from readers you wrote, notification settings,
            recent searches, the language each post and message was written in, where you are (country and city or town),
            your languages and how well you speak them, your connection choices, the people you chose &quot;Not now&quot; on,
            and the messages in every conversation you&apos;re in, with who sent each one.
          </li>
          <li>
            <span className="font-mono text-[14px] text-foreground">media/</span>: your profile photo and banner, the
            photos and videos in your posts and replies, and the photos in your conversations.
          </li>
        </ul>
        <DataExportButton />
      </Section>
      <Section title="Deactivate account">
        <p className="text-[15px] text-muted-foreground">
          Your profile and posts are hidden, and you&apos;re signed out on every device. Log in again any time to
          reactivate everything.
        </p>
        <DeactivateForm codeNeed={codeNeed} />
      </Section>
      <Section title="Delete account">
        <p className="text-[15px] text-muted-foreground">
          This permanently removes your profile, your posts and the replies under them, the messages you sent, and your
          photos and videos. It can&apos;t be undone.{" "}
          <a href="#your-data" className="font-semibold text-foreground underline underline-offset-4">
            Download your data first
          </a>{" "}
          if you want a copy.
        </p>
        <DeleteAccountForm handle={viewer.handle} codeNeed={codeNeed} />
      </Section>
    </>
  )
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-16 flex-col gap-3 border-b border-border px-4 py-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
