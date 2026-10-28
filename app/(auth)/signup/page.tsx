import Link from "next/link"
import { redirect } from "next/navigation"
import { getViewer } from "@/lib/auth"
import { firstParam } from "@/lib/params"
import { AuthForm } from "@/components/app/auth-form"
import { AuthNotice } from "../auth-notice"
import { RevealSuspense } from "@/components/app/reveal-suspense"

type SearchParams = Promise<{ notice?: string | string[] }>

export default function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <RevealSuspense>
      <SignupBody searchParams={searchParams} />
    </RevealSuspense>
  )
}

async function SignupBody({ searchParams }: { searchParams: SearchParams }) {
  const deleted = firstParam((await searchParams).notice) === "deleted"
  if (await getViewer()) redirect("/")
  return (
    <>
      {deleted ? <div className="mb-5"><AuthNotice>Your account is deleted, along with its posts, messages and media.</AuthNotice></div> : null}
      <AuthForm mode="signup" />
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground">
          Log in
        </Link>
      </p>
    </>
  )
}
