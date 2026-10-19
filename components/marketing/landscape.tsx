import { useId } from "react"

// A landscape drawn in the page's own ink, for the pictures in the scenes. It stands for a photograph; it is not one. The
// sky fades into the page, the sun sits low, three ridges lighten with distance, and a fine grain keeps it from looking
// flat. Every colour comes from a token, so it reads correctly in both themes.
export function Landscape() {
  const id = useId()
  const grain = `${id}-grain`
  const sky = `${id}-sky`
  const sun = `${id}-sun`
  return (
    <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" className="block size-full" aria-hidden>
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--muted)" }} />
          <stop offset="0.72" style={{ stopColor: "var(--background)" }} />
        </linearGradient>
        <radialGradient id={sun}>
          <stop offset="0" style={{ stopColor: "var(--foreground)" }} stopOpacity="0.22" />
          <stop offset="1" style={{ stopColor: "var(--foreground)" }} stopOpacity="0" />
        </radialGradient>
        <filter id={grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.09" />
          </feComponentTransfer>
        </filter>
      </defs>

      <rect width="800" height="600" fill={`url(#${sky})`} />
      <circle cx="560" cy="230" r="170" fill={`url(#${sun})`} />
      <circle cx="560" cy="230" r="46" style={{ fill: "var(--foreground)" }} opacity="0.5" />

      <path
        d="M0 318 C60 290 118 282 178 298 S286 262 336 280 S436 240 486 262 S594 296 654 274 S760 248 800 266 L800 600 L0 600Z"
        style={{ fill: "var(--foreground)" }}
        opacity="0.12"
      />
      <path
        d="M0 398 C70 352 130 350 200 376 S330 330 400 360 S520 394 590 362 S720 330 800 368 L800 600 L0 600Z"
        style={{ fill: "var(--foreground)" }}
        opacity="0.24"
      />
      <path
        d="M0 470 C90 436 170 436 250 462 S400 500 480 470 S640 428 720 458 S770 470 800 452 L800 600 L0 600Z"
        style={{ fill: "var(--foreground)" }}
        opacity="0.42"
      />
      <rect y="548" width="800" height="52" style={{ fill: "var(--foreground)" }} opacity="0.5" />

      <rect width="800" height="600" filter={`url(#${grain})`} style={{ fill: "var(--foreground)" }} />
    </svg>
  )
}
