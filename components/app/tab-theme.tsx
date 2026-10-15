"use client"

import { useEffect, useState, type CSSProperties, type ReactNode } from "react"

// The text colour that reads best on a fill: black or white, whichever has the higher contrast (WCAG relative luminance).
const INK_BLACK = "#0a0a0a"
const INK_WHITE = "#fafafa"
function inkFor(red: number, green: number, blue: number): string {
  const linear = (value: number) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
  const contrastWithBlack = (luminance + 0.05) / (0.0030 + 0.05)
  const contrastWithWhite = (1 + 0.05) / (luminance + 0.05)
  return contrastWithBlack >= contrastWithWhite ? INK_BLACK : INK_WHITE
}

// Themes the tabs inside it from a banner photo. The photo's average colour fills the active tab, and the text on it is black
// or white, whichever reads. With no photo nothing is set, so the tabs keep the page's own ink.
export function BannerTabTheme({ src, children }: { src: string | null; children: ReactNode }) {
  const [theme, setTheme] = useState<{ src: string; style: CSSProperties } | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    const image = new Image()
    image.decoding = "async"
    image.onload = () => {
      if (cancelled) return
      try {
        const canvas = document.createElement("canvas")
        canvas.width = 24
        canvas.height = 8
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) return
        context.drawImage(image, 0, 0, 24, 8)
        const pixels = context.getImageData(0, 0, 24, 8).data
        let red = 0
        let green = 0
        let blue = 0
        const count = pixels.length / 4
        for (let index = 0; index < pixels.length; index += 4) {
          red += pixels[index]
          green += pixels[index + 1]
          blue += pixels[index + 2]
        }
        red /= count
        green /= count
        blue /= count
        setTheme({
          src,
          style: {
            "--tab-fill": `rgb(${Math.round(red)} ${Math.round(green)} ${Math.round(blue)})`,
            "--tab-ink": inkFor(red, green, blue),
          } as CSSProperties,
        })
      } catch {
        // A photo that cannot be read leaves the tabs in the page's ink.
      }
    }
    image.src = src
    return () => {
      cancelled = true
      image.onload = null
    }
  }, [src])

  // A theme is kept only for the photo it was made from, so a new banner never shows the old colour.
  const style = theme && theme.src === src ? theme.style : undefined
  return <div style={style}>{children}</div>
}
