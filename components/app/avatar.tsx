import { cn } from "@/lib/utils"

export type AvatarUser = { id: string; name: string; avatarFile: string | null }

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  const first = words[0][0] ?? ""
  const second = words.length > 1 ? words[1][0] ?? "" : ""
  return (first + second).toUpperCase()
}

// Every avatar is a circle. The shape comes from an overflow-hidden round box, so the
// photo, the initials and the hover halo around it all share one edge.
export function Avatar({ user, size = 40, className }: { user: AvatarUser; size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={user.name}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className={cn("relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full", className)}
    >
      {user.avatarFile ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/media/${user.avatarFile}?w=${size <= 96 ? 160 : 640}`} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        <span className="grid size-full place-items-center bg-foreground font-semibold tracking-tight text-background" style={{ fontFamily: "var(--font-sora), sans-serif" }}>
          {initialsOf(user.name)}
        </span>
      )}
    </span>
  )
}
