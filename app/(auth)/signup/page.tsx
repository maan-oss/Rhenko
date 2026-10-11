import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { getViewer } from "@/lib/auth"
import { firstParam } from "@/lib/params"
import { AuthForm } from "@/components/app/auth-form"
import { AuthNotice } from "../auth-notice"

type SearchParams = Promise<{ notice?: string | string[] }>

export default function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={null}>
      <SignupBody searchParams={searchParams} />
    </Suspense>
  )
}

async function SignupBody({ searchParams }: { searchParams: SearchParams }) {
  const deleted = firstParam((await searchParams).notice) === "deleted"
  if (await getViewer()) redirect("/")
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Create your account</h1>
        <p className="text-[15px] text-muted-foreground">It takes a minute. You can change your name later.</p>
      </div>
      {deleted ? <AuthNotice>Your account is deleted, along with its posts, messages and media.</AuthNotice> : null}
      <AuthForm mode="signup" />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  )
}
