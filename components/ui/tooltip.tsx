"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "@/lib/utils"

// A small label that shows when a control is hovered or focused. It names what an icon button does, so the icon alone is
// enough. Wrap the controls in one TooltipProvider; the trigger is any element, passed with `render`.
function TooltipProvider({ delay = 350, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} closeDelay={0} {...props} />
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  children,
  ...props
}: TooltipPrimitive.Popup.Props & {
  side?: TooltipPrimitive.Positioner.Props["side"]
  sideOffset?: number
  align?: TooltipPrimitive.Positioner.Props["align"]
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="isolate z-[70]">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "pointer-events-none rounded-full bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-[0_6px_18px_rgba(0,0,0,0.18)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
