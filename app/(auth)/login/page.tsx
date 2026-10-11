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
      <AuthForm mode="login" />
      <p className="text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-dusk underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  )
}
