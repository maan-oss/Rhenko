import { firstParam } from "@/lib/params"
import { MAX_EMAIL } from "@/lib/account-rules"
import { ResetPasswordForm } from "@/components/app/auth-form"
import { AuthBack, AuthBar, AuthTitle, AuthTopLink } from "@/components/app/auth-frame"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ email?: string | string[] }>

export default function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <RevealSuspense>
      <ResetBody searchParams={searchParams} />
    </RevealSuspense>
  )
}

async function ResetBody({ searchParams }: { searchParams: SearchParams }) {
  const email = (firstParam((await searchParams).email) ?? "").slice(0, MAX_EMAIL)
  return (
    <>
      <AuthBar
        left={<AuthBack href="/login" label="Back to log in" />}
        right={<AuthTopLink href="/forgot-password">New code</AuthTopLink>}
      />
      <AuthTitle title="New password">Enter the code we emailed you.</AuthTitle>
      <ResetPasswordForm email={email} />
    </>
  )
}
