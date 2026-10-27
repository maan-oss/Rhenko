import { Suspense } from "react"
import { requireViewer, currentSessionHash } from "@/lib/auth"
import { sessionsFor, twoFactorFor } from "@/lib/settings-data"
import { passkeysOf } from "@/lib/passkeys"
import { describeAgent, formatCount } from "@/lib/format"
import { RelativeTime } from "@/components/app/time-text"
import { PageHeader } from "@/components/app/page-header"
import { ChangePasswordForm, RevokeOthersButton, RevokeSessionButton, TwoFactorPanel } from "@/components/app/security-panels"
import { PasskeysPanel } from "@/components/app/passkey-panel"

export default function SecuritySettingsPage() {
  return (
    <Suspense fallback={null}>
      <SecurityBody />
    </Suspense>
  )
}

async function SecurityBody() {
  const viewer = await requireViewer()
  const current = await currentSessionHash()
  const sessions = await sessionsFor(viewer.id)
  const twoFactor = await twoFactorFor(viewer.id)
  return (
    <>
      <PageHeader title="Security" backHref="/settings" />
      <Section title="Password">
        <ChangePasswordForm />
      </Section>
      <Section title="Two-factor sign-in">
        <TwoFactorPanel enabled={twoFactor.enabled} usable={twoFactor.usable} codesLeft={twoFactor.recoveryLeft} />
      </Section>
      <Section title="Passkeys and security keys">
        <PasskeysPanel passkeys={await passkeysOf(viewer.id)} />
      </Section>
      <Section title="Signed-in devices">
        <p className="text-[15px] text-muted-foreground">
          {formatCount(sessions.length)} {sessions.length === 1 ? "device is" : "devices are"} signed in to your account.
        </p>
        <ul className="flex flex-col divide-y divide-border">
          {sessions.map((session) => (
            <li key={session.tokenHash} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{describeAgent(session.userAgent)}</p>
                <p className="text-sm text-muted-foreground">
                  Active <RelativeTime at={session.lastSeen} /> · Signed in <RelativeTime at={session.createdAt} />
                </p>
              </div>
              <RevokeSessionButton tokenHash={session.tokenHash} current={session.tokenHash === current} />
            </li>
          ))}
        </ul>
        {sessions.length > 1 ? <RevokeOthersButton /> : null}
      </Section>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}
