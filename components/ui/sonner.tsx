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
        // A toast is a raised card and its buttons are pills, the same shape as every other button. The colours are the
        // page's own ink and surface, so no toast carries a tint.
        classNames: {
          toast: "cn-toast rounded-3xl border border-border bg-popover text-popover-foreground shadow-[0_14px_36px_-16px_rgb(0_0_0/0.35)]",
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
