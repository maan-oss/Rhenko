import type { ReactNode } from "react"
import { AuthFrame } from "@/components/app/auth-frame"

// Sign-in and sign-up: one narrow column, with the art beside it on wide screens.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>
}
