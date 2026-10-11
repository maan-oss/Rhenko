import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { getViewer } from "@/lib/auth"
import { AuthForm } from "@/components/app/auth-form"

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupBody />
    </Suspense>
  )
}

async function SignupBody() {
  if (await getViewer()) redirect("/")
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Create your account</h1>
        <p className="text-[15px] text-muted-foreground">It takes a minute. You can change your name later.</p>
      </div>
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
