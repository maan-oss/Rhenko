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
    <AuthForm
      mode="signup"
      notice={deleted ? <AuthNotice>Your account is deleted, along with its posts, messages and media.</AuthNotice> : null}
    />
  )
}
