"use client"

import { Arc, Atom, BouncingDots, Orbit, Ring, Wave } from "loading-dev"

export function LoadersDemo() {
  return (
    <div className="flex flex-wrap items-center gap-8">
      <Arc size={24} />
      <Atom size={24} />
      <BouncingDots size={24} />
      <Orbit size={24} />
      <Ring size={24} />
      <Wave size={24} />
    </div>
  )
}
