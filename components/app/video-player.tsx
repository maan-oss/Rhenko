"use client"

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react"
import { Check, Maximize, Minimize, MoreHorizontal, Pause, Play, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

// Our own player for a video in a post and in the composer. The browser's controls are not used: the bar, its play and
// mute buttons, the time, the seek slider, speed and full screen are all drawn here, so they look the same everywhere and
// sit on the picture the way the rest of Rhenko does.

const SPEEDS = [0.5, 1, 1.25, 1.5, 2]
// The bar slides away this long after the picture starts playing, and comes back when the pointer moves over the video.
const HIDE_AFTER_MS = 2400
const SKIP_SECONDS = 5

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

// Whole seconds for the bar: m:ss, or h:mm:ss from an hour up. Unknown lengths show as dashes.
export function playerClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--"
  const whole = Math.floor(seconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = String(whole % 60).padStart(2, "0")
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`
}

const ICON =
  "grid size-11 shrink-0 place-items-center rounded-full text-white outline-none transition-colors duration-150 hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white sm:size-9"

export function VideoPlayer({
  src,
  label,
  maxHeight = "100%",
  startMuted = false,
  videoRef,
  className,
  children,
}: {
  src: string
  label: string
  // The tallest the picture may be, as any CSS length. Full screen lifts it.
  maxHeight?: string
  startMuted?: boolean
  // Lets a parent keep hold of the video element, for example to play only part of it.
  videoRef?: RefObject<HTMLVideoElement | null>
  className?: string
  // Drawn over the picture, under the bar, such as a badge.
  children?: ReactNode
}) {
  const ownVideo = useRef<HTMLVideoElement>(null)
  // The element is read when it is used, so the handlers below change the element and not a copy of the ref.
  function element(): HTMLVideoElement | null {
    return ownVideo.current
  }
  const frame = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  // While the slider is held, the time it shows follows the pointer, not the video.
  const [scrub, setScrub] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(startMuted)
  const [rate, setRate] = useState(1)
  const [menuOpen, setMenuOpen] = useState(false)
  const [active, setActive] = useState(true)
  const [full, setFull] = useState(false)
  const [failed, setFailed] = useState(false)

  const timer = useRef(0)
  const holding = useRef(false)
  const dragging = useRef(false)
  const menu = useRef<HTMLDivElement>(null)

  // The bar shows while the video is paused, or for a moment after the pointer moves, and slides away while it plays.
  function wake() {
    setActive(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const player = element()
      if (holding.current || !player || player.paused) return
      setActive(false)
    }, HIDE_AFTER_MS)
  }

  useEffect(() => {
    const clear = () => window.clearTimeout(timer.current)
    const onFullscreen = () => setFull(document.fullscreenElement === frame.current)
    document.addEventListener("fullscreenchange", onFullscreen)
    return () => {
      clear()
      document.removeEventListener("fullscreenchange", onFullscreen)
    }
  }, [])

  // Closes the speed menu on a press outside it and on Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onPress = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("pointerdown", onPress)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPress)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  function toggle() {
    const player = element()
    if (!player) return
    if (player.paused) player.play().catch(() => setFailed(true))
    else player.pause()
  }

  function seek(seconds: number) {
    const player = element()
    if (!player || !Number.isFinite(duration) || duration <= 0) return
    const next = Math.min(Math.max(seconds, 0), duration)
    player.currentTime = next
    setTime(next)
  }

  function skip(by: number) {
    seek((element()?.currentTime ?? 0) + by)
    wake()
  }

  function changeMute() {
    const player = element()
    if (!player) return
    player.muted = !player.muted
    setMuted(player.muted)
    wake()
  }

  function changeRate(next: number) {
    const player = element()
    if (player) player.playbackRate = next
    setRate(next)
    setMenuOpen(false)
    wake()
  }

  function toggleFullScreen() {
    const player = element() as FullscreenVideo | null
    const wrap = frame.current
    if (document.fullscreenElement) {
      void document.exitFullscreen?.()
      return
    }
    if (wrap?.requestFullscreen) {
      wrap.requestFullscreen().catch(() => undefined)
      return
    }
    // iPhone Safari gives full screen only to the video element itself.
    player?.webkitEnterFullscreen?.()
  }

  // Keys work when the player itself has focus: Space or K plays, M mutes, F goes full screen, arrows skip.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    const keys: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      K: toggle,
      m: changeMute,
      M: changeMute,
      f: toggleFullScreen,
      F: toggleFullScreen,
      ArrowLeft: () => skip(-SKIP_SECONDS),
      ArrowRight: () => skip(SKIP_SECONDS),
    }
    const run = keys[event.key]
    if (!run) return
    event.preventDefault()
    run()
  }

  function fractionAt(clientX: number): number {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1)
  }

  function onSeekDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!(duration > 0)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragging.current = true
    setScrub(fractionAt(event.clientX) * duration)
    wake()
  }

  function onSeekMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    setScrub(fractionAt(event.clientX) * duration)
  }

  function onSeekUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    const at = fractionAt(event.clientX) * duration
    setScrub(null)
    seek(at)
  }

  function onSeekKey(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = { ArrowLeft: -SKIP_SECONDS, ArrowDown: -SKIP_SECONDS, ArrowRight: SKIP_SECONDS, ArrowUp: SKIP_SECONDS }
    if (event.key in keys) {
      event.preventDefault()
      skip(keys[event.key] ?? 0)
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      seek(0)
    }
    if (event.key === "End") {
      event.preventDefault()
      seek(duration)
    }
  }

  const shown = scrub ?? time
  const fraction = duration > 0 ? Math.min(shown / duration, 1) : 0
  const showBar = active || !playing || menuOpen

  return (
    <div
      ref={frame}
      role="group"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerLeave={() => {
        if (playing && !menuOpen) wake()
      }}
      style={{ "--player-max": maxHeight } as CSSProperties}
      className={cn(
        "group/player relative flex w-full items-center justify-center overflow-hidden bg-black outline-none focus-visible:ring-2 focus-visible:ring-ring fullscreen:size-full fullscreen:rounded-none",
        className
      )}
    >
      <video
        ref={(node) => {
          // The element goes to the parent's ref as well, when a parent asked for it.
          ownVideo.current = node
          if (videoRef) videoRef.current = node
        }}
        src={src}
        playsInline
        preload="metadata"
        muted={muted}
        aria-label={label}
        onClick={toggle}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration)
          event.currentTarget.playbackRate = rate
        }}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => {
          if (!dragging.current) setTime(event.currentTarget.currentTime)
        }}
        onPlay={() => {
          setPlaying(true)
          setFailed(false)
          wake()
        }}
        onPause={() => {
          setPlaying(false)
          window.clearTimeout(timer.current)
          setActive(true)
        }}
        onEnded={() => {
          setPlaying(false)
          setActive(true)
        }}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onError={() => setFailed(true)}
        className="block max-h-(--player-max) w-full cursor-pointer object-contain fullscreen:h-full fullscreen:max-h-none"
      />

      {children}

      {!playing && !failed ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play"
          className="glass absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-foreground outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring max-sm:size-14"
        >
          <Play className="size-7 fill-current pl-0.5" aria-hidden />
        </button>
      ) : null}

      {failed ? (
        <p role="alert" className="absolute inset-x-4 top-1/2 -translate-y-1/2 text-center text-sm text-white">
          This video can&apos;t be played here.
        </p>
      ) : null}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-black/80 via-black/40 to-transparent px-2 pt-12 pb-1.5 text-white transition-opacity duration-200 sm:px-3",
          showBar ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onPointerEnter={() => {
          holding.current = true
          setActive(true)
        }}
        onPointerLeave={() => {
          holding.current = false
          wake()
        }}
      >
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Number.isFinite(duration) ? Math.round(duration) : 0}
          aria-valuenow={Math.round(shown)}
          aria-valuetext={`${playerClock(shown)} of ${playerClock(duration)}`}
          onPointerDown={onSeekDown}
          onPointerMove={onSeekMove}
          onPointerUp={onSeekUp}
          onPointerCancel={() => {
            dragging.current = false
            setScrub(null)
          }}
          onKeyDown={onSeekKey}
          className="group/seek relative flex h-5 w-full cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-0 rounded-full"
        >
          <div className="relative h-1 w-full rounded-full bg-white/30 transition-[height] duration-150 group-hover/seek:h-1.5">
            <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${fraction * 100}%` }} />
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-150 group-hover/seek:scale-125"
            style={{ left: `${fraction * 100}%` }}
          />
        </div>

        <div className="@container flex items-center gap-0.5">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className={ICON}>
            {playing ? <Pause className="size-5 fill-current" aria-hidden /> : <Play className="size-5 fill-current pl-0.5" aria-hidden />}
          </button>
          <p className="min-w-0 px-1.5 text-[13px] font-medium tabular-nums whitespace-nowrap" aria-hidden="true">
            {playerClock(shown)} <span className="hidden text-white/65 @min-[340px]:inline">/ {playerClock(duration)}</span>
          </p>

          <div className="ml-auto flex items-center gap-0.5">
            <div ref={menu} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="More options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                className={ICON}
              >
                <MoreHorizontal className="size-5" aria-hidden />
              </button>
              {menuOpen ? (
                <div
                  id={menuId}
                  role="menu"
                  aria-label="Playback speed"
                  className="absolute right-0 bottom-12 z-10 w-40 overflow-hidden rounded-2xl bg-black/85 p-1.5 text-[14px] text-white shadow-lg ring-1 ring-white/10 backdrop-blur-md"
                >
                  <p className="px-2.5 pt-1 pb-1.5 text-[12px] font-semibold tracking-wide text-white/60">Playback speed</p>
                  {SPEEDS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      role="menuitemradio"
                      aria-checked={rate === speed}
                      onClick={() => changeRate(speed)}
                      className="flex h-9 w-full items-center justify-between rounded-xl px-2.5 text-left transition-colors duration-150 outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <span>{speed === 1 ? "Normal" : `${speed}×`}</span>
                      {rate === speed ? <Check className="size-4" aria-hidden /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button type="button" onClick={changeMute} aria-label={muted ? "Unmute" : "Mute"} className={ICON}>
              {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
            </button>
            <button type="button" onClick={toggleFullScreen} aria-label={full ? "Exit full screen" : "Full screen"} className={ICON}>
              {full ? <Minimize className="size-5" aria-hidden /> : <Maximize className="size-5" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
