"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

// Two themes only: light and dark. No system option.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      themes={["light", "dark"]}
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}
