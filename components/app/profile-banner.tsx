import { BANNER_HEIGHT, BANNER_WIDTH, bannerLines } from "@/lib/banner-pattern"
import { cn } from "@/lib/utils"

// A profile's banner: the owner's photo, or a drawing made from the handle when there is no photo. It is a box with its own
// edge and no fade, so its colour stays inside it and never runs into the page around it.
// A photo the person has just picked, before it is saved, is passed as src and shows in place of the saved one.
export function ProfileBanner({
  file,
  src,
  handle,
  className,
  children,
}: {
  file: string | null
  src?: string | null
  handle: string
  className?: string
  children?: React.ReactNode
}) {
  const photo = src ?? (file ? `/media/${file}?w=1280` : null)
  return (
    <div className={cn("relative overflow-hidden rounded-3xl border border-border bg-muted text-dusk", className)}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" decoding="async" className="size-full object-cover" />
      ) : (
        <svg
          viewBox={`0 0 ${BANNER_WIDTH} ${BANNER_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          className="size-full"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
        >
          {bannerLines(handle).map((line, index) => (
            <path key={index} d={line.d} opacity={line.opacity} />
          ))}
        </svg>
      )}
      {children}
    </div>
  )
}
