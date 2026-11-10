"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme = "light" } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        // A toast is a pill, the same shape as its buttons. The colours are the page's own ink and surface, so no toast carries a tint.
        classNames: {
          toast: "cn-toast !w-auto !max-w-[min(22rem,calc(100vw-2rem))] !min-w-[15rem] rounded-full border border-border/60 bg-popover/95 text-popover-foreground shadow-[0_18px_44px_-16px_rgba(0,0,0,0.38)] backdrop-blur-xl",
          actionButton: "!h-8 !rounded-full !bg-foreground !px-3.5 !text-[13px] !font-semibold !text-background",
          cancelButton: "!h-8 !rounded-full !bg-muted !px-3.5 !text-[13px] !font-semibold !text-foreground",
          closeButton: "!rounded-full !border-border !bg-background !text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
