import type { ReactNode } from "react"
import { AuthFrame } from "@/components/app/auth-frame"

// The setup screens after sign-up. They sit in the same phone screen as sign-in and sign-up.
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>
}
