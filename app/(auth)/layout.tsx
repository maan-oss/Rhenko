import type { ReactNode } from "react"
import { AuthFrame } from "@/components/app/auth-frame"

// Sign-in and sign-up: one narrow column on every screen size.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>
}
