"use client"

import { useEffect, useRef, useState } from "react"
import { Chapter } from "@/components/marketing/chapter"
import { Manifesto } from "@/components/marketing/manifesto"
import { FeedSteer } from "@/components/marketing/scene-feed"
import { TenSeconds } from "@/components/marketing/scene-post"
import { Calls } from "@/components/marketing/scene-call"
import { Circles } from "@/components/marketing/scene-circle"
import { PhotoLabel } from "@/components/marketing/scene-metadata"
import { FeatureStage } from "@/components/marketing/scene-features"

// The landing page's scroll chapters, each one a pinned section with its own scene. The page itself stays a server
// component, so the scroll code is confined to these wrappers.

export function ManifestoChapter() {
  return (
    <Chapter id="manifesto" label="Introduction" height="160svh">
      {(scene) => <Manifesto {...scene} />}
    </Chapter>
  )
}

export function FeedChapter() {
  return (
    <Chapter id="feed" label="Steering the feed" height="320svh">
      {(scene) => <FeedSteer {...scene} />}
    </Chapter>
  )
}

export function UndoChapter() {
  return (
    <Chapter id="undo" label="Undo" height="300svh">
      {(scene) => <TenSeconds {...scene} />}
    </Chapter>
  )
}

export function CallsChapter() {
  return (
    <Chapter id="calls" label="Calls" height="300svh">
      {(scene) => <Calls {...scene} />}
    </Chapter>
  )
}

export function CirclesChapter() {
  return (
    <Chapter id="circles" label="Circles" height="320svh">
      {(scene) => <Circles {...scene} />}
    </Chapter>
  )
}

export function PhotosChapter() {
  return (
    <Chapter id="photos" label="Photo labels" height="280svh">
      {(scene) => <PhotoLabel {...scene} />}
    </Chapter>
  )
}

// The strip moves sideways by exactly the distance it overflows, and the chapter is that distance plus one screen tall, so
// one turn of the scroll wheel moves it by the same amount at every window size.
export function FeaturesChapter() {
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [distance, setDistance] = useState(0)

  useEffect(() => {
    const node = viewport.current
    const row = track.current
    if (!node || !row) return
    const measure = () => setDistance(Math.max(0, row.scrollWidth - node.clientWidth))
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  return (
    <Chapter id="features" label="Everything else" height={distance > 0 ? `calc(${distance}px + 100svh)` : "300svh"}>
      {(scene) => <FeatureStage {...scene} distance={distance} viewport={viewport} track={track} />}
    </Chapter>
  )
}
