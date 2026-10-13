import { cn } from "@/lib/utils"

// The Rhenko R. The tile is the app's mark: ink on the page colour in each theme, so it reads as black and white
// whatever the theme. RhenkoR is the R alone, for places where the tile would be too heavy.
const R_PATH = "M375.7 455.8C358.3 454.2 342 447.3 330.2 436.5C324.1 430.9 304 408.4 268.5 367.1C247.9 343.2 246 340.9 246 339.9C246 339.4 248.4 336.2 251.3 332.8C254.2 329.3 259 323.6 262 320C287.2 290.1 300.6 274.6 305.6 269.6C314.8 260.3 326 253.9 336.7 251.6C340.4 250.8 339.1 249.5 358.5 272C405.6 326.6 426.3 350.9 453.5 383.5C465 397.2 482.4 418 492.2 429.7C509.1 449.8 511.7 453.8 508.8 455.6C507.2 456.6 386.1 456.7 375.7 455.8ZM62.6 454.4C29.1 446.9 7 423.3 7 395.1C7 381.5 10.9 372.2 22.9 356.7C27.1 351.3 40.4 334.2 52.4 318.7C75.5 289.1 92.7 266.9 106.8 248.5C119.9 231.5 137.1 210.2 143.5 203C163.7 180.4 187.6 166.4 215.5 160.9C221.2 159.7 245.2 159.5 348.7 159.5C418.2 159.5 475 159.2 475 158.9C475 158.6 473.5 156.3 471.6 153.8C464.3 144.3 449.6 137.3 428.5 133.2C421.7 131.9 400.2 131.6 281 131C125.9 130.3 137.3 130.8 118.6 123.4C97.8 115 81.6 102.6 62.8 80.5C57.6 74.5 46.4 61.4 37.9 51.4C-2.8 3.7 -1 6 0.8 3.4C3 0 4 0 180.2 0C370.8 0 361.5 -0.2 374.4 5.8C387.9 12.2 399.2 23.2 408.9 39.5C411.6 43.9 427.1 69.8 443.5 97C459.9 124.2 474.7 149.4 476.3 153C484.2 170.1 478.6 190.7 461.2 209.1C453 217.8 441 226 429.5 230.6C412 237.6 419.1 237.2 288.5 238C162 238.7 166 238.6 146.5 243.9C132.7 247.7 110.8 257.8 104.7 263.2C103.3 264.4 104.5 264.1 108.1 262.1C116.6 257.5 136 251.4 149.9 249.1C161.7 247.1 165.9 247 242.4 247L322.5 247L316.5 250.3C301.4 258.4 299.3 260.6 238.3 331.4C173.8 406.1 162.9 418.1 148.5 429.9C135.7 440.4 119.8 448.6 103.5 453C92.8 455.9 72.5 456.6 62.6 454.4Z"

export function RhenkoSymbol({
  className,
  label = "Rhenko",
}: {
  className?: string
  label?: string
}) {
  return (
    <svg viewBox="0 0 512 512" role="img" aria-label={label} className={cn("size-6 shrink-0", className)}>
      <rect width="512" height="512" rx="118" className="fill-foreground" />
      <path className="fill-background" fillRule="evenodd" transform="translate(256 256) scale(0.58) translate(-255 -228.5)" d={R_PATH} />
    </svg>
  )
}

export function RhenkoR({
  className,
  label = "Rhenko",
}: {
  className?: string
  label?: string
}) {
  return (
    <svg viewBox="0 0 510 457" role="img" aria-label={label} className={cn("size-6 shrink-0 fill-current", className)}>
      <path fillRule="evenodd" d={R_PATH} />
    </svg>
  )
}
