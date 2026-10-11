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
      <AuthForm mode="signup" />
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-dusk underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  )
}
