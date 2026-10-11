import { cn } from "@/lib/utils"

export type AvatarUser = { id: string; name: string; avatarFile: string | null }

// The default avatar is the brand mark's cut: a square with one quarter disc removed.
const CUT = "M0 0H50A50 50 0 0 0 100 50V100H0Z"

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = words[0][0] ?? ""
  const second = words.length > 1 ? words[1][0] ?? "" : ""
  return (first + second).toUpperCase()
}

export function Avatar({ user, size = 40, className }: { user: AvatarUser; size?: number; className?: string }) {
  const clipId = `av-${user.id}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={user.name}
      className={cn("shrink-0 select-none", className)}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={CUT} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {user.avatarFile ? (
          <image
            href={`/media/${user.avatarFile}`}
            x={0}
            y={0}
            width={100}
            height={100}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : (
          <>
            <rect width={100} height={100} className="fill-foreground" />
            <text
              x={50}
              y={53}
              dominantBaseline="central"
              textAnchor="middle"
              className="fill-background"
              style={{ fontFamily: "var(--font-sora), sans-serif", fontWeight: 600, fontSize: 38, letterSpacing: "-0.02em" }}
            >
              {initialsOf(user.name)}
            </text>
          </>
        )}
      </g>
    </svg>
  )
}
