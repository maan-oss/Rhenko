import type { ReactNode } from "react"
import { BrandIntro } from "@/components/app/brand-intro"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-4 py-12">
      <BrandIntro />
      {children}
    </main>
  )
}
