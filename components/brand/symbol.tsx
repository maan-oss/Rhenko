import { cn } from "@/lib/utils"

export function RhenkoSymbol({
  className,
  label = "Rhenko",
}: {
  className?: string
  label?: string
}) {
  return (
    <svg
      viewBox="585 310 388 388"
      role="img"
      aria-label={label}
      className={cn("size-6 fill-current", className)}
    >
      <path
        fillRule="evenodd"
        d="M735 310H823A150 150 0 0 0 973 460V548A150 150 0 0 0 823 698H735A150 150 0 0 0 585 548V460A150 150 0 0 0 735 310Z M779 450Q789 494 833 504Q789 514 779 558Q769 514 725 504Q769 494 779 450Z"
      />
    </svg>
  )
}
