"use client"

import { Chapter } from "@/components/marketing/chapter"
import { Manifesto } from "@/components/marketing/manifesto"
import { FeedSteer } from "@/components/marketing/scene-feed"
import { TenSeconds } from "@/components/marketing/scene-post"
import { Calls } from "@/components/marketing/scene-call"
import { Circles } from "@/components/marketing/scene-circle"
import { PhotoLabel } from "@/components/marketing/scene-metadata"

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
