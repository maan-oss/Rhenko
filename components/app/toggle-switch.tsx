import { cn } from "@/lib/utils"

// The look of an on or off switch. The control that holds it gives the label and the state, so this is only the picture.
export function ToggleSwitch({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200", on ? "bg-dusk" : "bg-muted-foreground/35")}>
      <span className={cn("absolute top-0.5 left-0.5 size-6 rounded-full bg-background shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200", on && "translate-x-5")} />
    </span>
  )
}
