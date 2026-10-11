import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { getViewer } from "@/lib/auth"
import { AuthForm } from "@/components/app/auth-form"

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginBody />
    </Suspense>
  )
}

async function LoginBody() {
  if (await getViewer()) redirect("/")
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold tracking-tight">Welcome back</h1>
        <p className="text-[15px] text-muted-foreground">Log in with your handle and password.</p>
      </div>
      <AuthForm mode="login" />
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-foreground underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  )
}
