import type { ReactNode } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { checkUnsubscribeToken } from "@/lib/digest"
import { firstParam } from "@/lib/params"
import { AuthNotice } from "../auth-notice"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export const metadata: Metadata = {
  title: { absolute: "Turn off the daily digest · Rhenko" },
  robots: { index: false, follow: false },
  // The address holds the token, so no other site is told it.
  referrer: "no-referrer",
}

type SearchParams = Promise<{ t?: string | string[]; done?: string | string[]; wait?: string | string[] }>

const PRIMARY =
  "flex h-11 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-90"
const TEXT_LINK = "font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"

// The page behind the "Turn off the daily digest" link in a digest email. No sign-in: the signed link is the proof. Opening it
// changes nothing; the button does, so a link checker that opens every link cannot turn anyone's digest off.
export default function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <RevealSuspense>
      <UnsubscribeBody searchParams={searchParams} />
    </RevealSuspense>
  )
}

async function UnsubscribeBody({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  if (firstParam(params.done) === "1") {
    return (
      <Panel title="The digest is off" body="You won't get the daily email any more. You can turn it back on in Settings, under Notifications.">
        <Link href="/settings/notifications" className={PRIMARY}>
          Open Settings
        </Link>
      </Panel>
    )
  }

  const token = firstParam(params.t) ?? ""
  const checked = checkUnsubscribeToken(token)
  if (!checked.ok) {
    return (
      <Panel
        title={checked.reason === "expired" ? "This link has expired" : "This link isn't valid"}
        body="Log in and turn the daily digest off in Settings, under Notifications."
      >
        <Link href="/settings/notifications" className={PRIMARY}>
          Open Settings
        </Link>
      </Panel>
    )
  }

  return (
    <Panel title="Turn off the daily digest?" body="You'll stop getting the daily email of what you missed. Your notifications in Rhenko stay as they are.">
      {firstParam(params.wait) === "1" ? <AuthNotice tone="warning">Too many tries. Wait a few minutes, then try again.</AuthNotice> : null}
      <form method="post" action={`/api/digest/unsubscribe?t=${encodeURIComponent(token)}`} className="flex flex-col gap-3">
        <input type="hidden" name="page" value="1" />
        <button type="submit" className={PRIMARY}>
          Turn off the digest
        </button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Changed your mind?{" "}
        <Link href="/" className={TEXT_LINK}>
          Open Rhenko
        </Link>
      </p>
    </Panel>
  )
}

function Panel({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="settle flex flex-col gap-2">
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">{title}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      <div className="settle flex flex-col gap-4" style={{ animationDelay: "60ms" }}>
        {children}
      </div>
    </div>
  )
}
