"use client"

import { Home, Mail, Search, Settings } from "lucide-react"
import { LetterCascade } from "@/components/ui/letter-cascade"
import { TextMorph } from "@/components/ui/text-morph"
import { SplitFlapDisplay } from "@/components/ui/split-flap-display"
import { PixelCanvas } from "@/components/ui/pixel-canvas"
import { MagneticDock } from "@/components/ui/magnetic-dock"

export function EffectsDemo() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3 border border-border p-5">
          <p className="text-sm font-semibold">Letter cascade (hover)</p>
          <LetterCascade text="HOVER ME" className="text-3xl font-semibold tracking-tight" />
        </div>
        <div className="flex min-w-0 flex-col gap-3 border border-border p-5">
          <p className="text-sm font-semibold">Text morph</p>
          <TextMorph words={["Public", "Local", "Yours"]} className="text-3xl font-semibold" />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-3 border border-border p-5">
        <p className="text-sm font-semibold">Split-flap display</p>
        <div className="max-w-full overflow-x-auto">
          <SplitFlapDisplay text="RHENKO" />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-2">
        <div className="relative h-48 min-w-0 overflow-hidden border border-border">
          <PixelCanvas
            className="absolute inset-0"
            colors={["#000000", "#4b3f72", "#b3a4e8"]}
            gap={8}
            speed={0.02}
          />
          <p className="relative z-10 p-4 text-sm font-semibold">Pixel canvas</p>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center gap-3 border border-border p-5">
          <p className="self-start text-sm font-semibold">Magnetic dock</p>
          <div className="max-w-full overflow-x-auto">
            <MagneticDock
              items={[
                { id: "home", label: "Home", icon: <Home /> },
                { id: "search", label: "Search", icon: <Search /> },
                { id: "mail", label: "Mail", icon: <Mail /> },
                { id: "settings", label: "Settings", icon: <Settings /> },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
