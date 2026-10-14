import type { ReactNode } from "react"
import { AuthFrame } from "@/components/app/auth-frame"

// The setup screens after sign-up. A little wider than sign-in, so the profile can be shown at close to its real size.
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <AuthFrame width="wide">{children}</AuthFrame>
}
