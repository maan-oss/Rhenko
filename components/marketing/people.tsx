import { cn } from "@/lib/utils"

// The people and posts in the scenes are invented for the picture. The controls around them are the app's own, drawn with
// the app's tokens.
export const PEOPLE = {
  iris: {
    name: "Iris",
    letter: "I",
    time: "2h",
    body: "Photos from the ridge walk on Saturday. The light was better than the forecast promised.",
  },
  dev: {
    name: "Dev",
    letter: "D",
    time: "3h",
    body: "Renamed four hundred photos by the date they were taken. The script is short, and I will share it.",
  },
  sam: {
    name: "Sam",
    letter: "S",
    time: "5h",
    body: "Is it normal for the kettle to sound like a jet? Asking for the flat below.",
  },
  maya: {
    name: "Maya",
    letter: "M",
    time: "7h",
    body: "Two tickets for the Sunday market. First to reply gets them.",
  },
} as const

export type PersonId = keyof typeof PEOPLE

export function Monogram({ letter, className }: { letter: string; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-[14px] font-semibold", className)}>
      {letter}
    </span>
  )
}
