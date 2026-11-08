import { requireViewer } from "@/lib/auth"
import { ageCheckState } from "@/lib/age-assurance"
import { ageGateMessage } from "@/lib/age-rules"
import { PageHeader } from "@/components/app/page-header"
import { AgeCheckButton } from "@/components/app/age-check-button"
import { IdBadgeSwitch } from "@/components/app/id-badge-switch"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export default function AgeSettingsPage() {
  return (
    <RevealSuspense>
      <AgeBody />
    </RevealSuspense>
  )
}

async function AgeBody() {
  const viewer = await requireViewer()
  const { check, checkedAt, idBadge } = await ageCheckState(viewer.id)
  const gate = ageGateMessage(check)
  const canStart = check === "none" || check === "pending"
  return (
    <>
      <PageHeader title="Age check" backHref="/settings" />
      {canStart ? (
        <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
          <h2 className="text-lg font-semibold">Confirm you are 18 or over</h2>
          <p className="text-[15px] text-muted-foreground">
            Rhenko is for people 18 and over. Once you confirm your age you can post, reply, quote, repost, send messages and upload
            photos or videos. Reading and following stay open.
          </p>
        </section>
      ) : null}
      <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
        <p className="text-[15px]">
          {check === "adult" && checkedAt ? `Confirmed on ${formatDay(checkedAt)}.` : gate}
        </p>
        {canStart ? <AgeCheckButton label={check === "pending" ? "Continue my age check" : "Confirm my age"} /> : null}
      </section>
      {check === "adult" ? (
        <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
          <h2 className="text-lg font-semibold">ID checked mark</h2>
          <p className="text-[15px] text-muted-foreground">
            When this is on, a small shield marked ID checked appears beside your name on your profile and posts. Anyone can see it. It
            does not show your name, your date of birth, your ID or the day of the check.
          </p>
          <IdBadgeSwitch on={idBadge} />
        </section>
      ) : null}
      <section className="flex flex-col gap-2 px-4 py-4">
        <h2 className="text-lg font-semibold">What is checked</h2>
        <p className="text-[15px] text-muted-foreground">
          Stripe, a payments company, checks a photo of a government ID against a live selfie. Rhenko receives only the result and
          the day it was made. It does not receive your date of birth, your ID or your photo, and it asks Stripe to delete those once
          the result is in.
        </p>
      </section>
    </>
  )
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
}
