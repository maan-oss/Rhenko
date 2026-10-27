"use client"

import { useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react"
import { Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { usePreview } from "@/components/app/use-preview"
import { MAX_VIDEO_SECONDS } from "@/lib/rules"
import { coversWhole, firstWindow, formatClock, moveEnd, moveStart, rangeLabel, spokenLength, type Trim } from "@/lib/trim-rules"
import { useTrimPlayback } from "@/lib/use-trim-playback"
import { cn } from "@/lib/utils"

// One end of the timeline. The start handle hangs off the left of the part that is kept and the end handle off its right, so the
// two never sit on top of each other. Drag it, or use the arrow keys (a second at a time, a tenth with Shift), Page Up and
// Page Down (ten seconds), Home and End.
function Handle({
  side,
  label,
  time,
  low,
  high,
  duration,
  track,
  onMove,
}: {
  side: "start" | "end"
  label: string
  time: number
  // The earliest and latest this handle can be now, for assistive technology and the Home and End keys.
  low: number
  high: number
  duration: number
  track: RefObject<HTMLDivElement | null>
  onMove: (seconds: number) => void
}) {
  // How far the pointer was from the handle's edge when it took hold, so the handle doesn't jump to the pointer.
  const grab = useRef<number | null>(null)
  const isStart = side === "start"

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = track.current?.getBoundingClientRect()
    if (!rect) return
    event.currentTarget.setPointerCapture(event.pointerId)
    grab.current = event.clientX - (rect.left + (time / duration) * rect.width)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = track.current?.getBoundingClientRect()
    if (grab.current === null || !rect || rect.width === 0) return
    onMove(((event.clientX - grab.current - rect.left) / rect.width) * duration)
  }

  function release() {
    grab.current = null
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 1
    const moves: Record<string, number> = {
      ArrowLeft: time - step,
      ArrowDown: time - step,
      ArrowRight: time + step,
      ArrowUp: time + step,
      PageDown: time - 10,
      PageUp: time + 10,
      Home: low,
      End: high,
    }
    const want = moves[event.key]
    if (want === undefined) return
    event.preventDefault()
    onMove(want)
  }

  // The grip is the handle, so the focus halo hugs it. Its ::before makes a 44 pixel target that runs out from the part that
  // is kept, so the two handles' targets never overlap, however short the part is.
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={low}
      aria-valuemax={high}
      aria-valuenow={time}
      aria-valuetext={formatClock(time)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute top-2 grid h-10 w-3.5 cursor-ew-resize touch-none place-items-center bg-foreground select-none before:absolute before:inset-y-[-8px] before:content-['']",
        isStart ? "-translate-x-full rounded-l-lg before:right-0 before:-left-[30px]" : "rounded-r-lg before:-right-[30px] before:left-0"
      )}
      style={{ left: `${(time / duration) * 100}%` }}
    >
      <span className="h-4 w-0.5 rounded-full bg-background" />
    </div>
  )
}

// A sheet for choosing the part of a video to post. It shows the video, a timeline with a handle at each end of the part to
// keep, and that part as a range of times. The part is at least a second and at most the longest a post can carry; the handles
// can't cross. Play previews just that part. `initial` is the part chosen before, when a trim is being changed.
// Applying hands back the part, or null when it is the whole video, which needs no cut. The video itself is not cut here: it is
// sent whole with the part's start and end, and the server cuts it.
export function VideoTrim({
  file,
  duration,
  initial,
  onCancel,
  onApply,
}: {
  file: File
  duration: number
  initial: Trim | null
  onCancel: () => void
  onApply: (trim: Trim | null) => void
}) {
  const url = usePreview(file)
  const [win, setWin] = useState<Trim>(() => initial ?? firstWindow(duration, MAX_VIDEO_SECONDS))
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const tooLong = duration > MAX_VIDEO_SECONDS

  useTrimPlayback(video, url, win, false)

  // Moving a handle stops the preview and shows the picture at that handle, so the person sees where the cut falls.
  function show(seconds: number) {
    const player = video.current
    if (!player) return
    player.pause()
    player.currentTime = seconds
  }

  function moveFirst(seconds: number) {
    const next = moveStart(win, seconds, MAX_VIDEO_SECONDS)
    setWin(next)
    show(next.start)
  }

  function moveLast(seconds: number) {
    const next = moveEnd(win, seconds, duration, MAX_VIDEO_SECONDS)
    setWin(next)
    show(next.end)
  }

  function toggle() {
    const player = video.current
    if (!player) return
    if (player.paused) player.play().catch(() => setFailed(true))
    else player.pause()
  }

  const percent = (seconds: number) => `${(seconds / duration) * 100}%`

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className={cn("sm:max-w-lg", DIALOG_CLOSE_PHONE, DIALOG_FIT)} showCloseButton>
        <DialogTitle className="pr-8 text-base font-semibold">Trim your video</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {tooLong
            ? `This video is ${formatClock(duration)} long. A post can carry up to ${formatClock(MAX_VIDEO_SECONDS)}, so choose the part to keep.`
            : "Drag the handles to choose the part to post."}
        </DialogDescription>

        <div className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
            {url === null ? (
              <div className="aspect-video w-full" aria-hidden="true" />
            ) : (
              <video
                ref={video}
                src={url}
                playsInline
                preload="metadata"
                aria-label="The part of the video that will be kept"
                onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = win.start
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => setFailed(true)}
                className="block max-h-64 w-full bg-black object-contain"
              />
            )}
            <button
              type="button"
              onClick={toggle}
              disabled={failed}
              aria-label={playing ? "Pause the preview" : "Play the preview"}
              className="glass absolute bottom-2 left-2 grid size-11 place-items-center rounded-full text-foreground outline-none transition-colors duration-200 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {playing ? <Pause className="size-5 fill-current" aria-hidden /> : <Play className="size-5 fill-current" aria-hidden />}
            </button>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-lg font-semibold tabular-nums">{rangeLabel(win)}</p>
            <p className="text-[13px] text-muted-foreground tabular-nums">
              {spokenLength(win.end - win.start)} of {formatClock(duration)}
            </p>
          </div>

          <div className="px-8">
            <div ref={track} className="relative h-14">
              <div className="absolute inset-x-0 top-2 bottom-2 rounded-xl bg-muted" />
              <div
                className="absolute top-2 bottom-2 border-y-2 border-foreground bg-foreground/15"
                style={{ left: percent(win.start), width: percent(win.end - win.start) }}
              />
              <Handle
                side="start"
                label="Start of the part to keep"
                time={win.start}
                low={moveStart(win, 0, MAX_VIDEO_SECONDS).start}
                high={moveStart(win, Infinity, MAX_VIDEO_SECONDS).start}
                duration={duration}
                track={track}
                onMove={moveFirst}
              />
              <Handle
                side="end"
                label="End of the part to keep"
                time={win.end}
                low={moveEnd(win, 0, duration, MAX_VIDEO_SECONDS).end}
                high={moveEnd(win, Infinity, duration, MAX_VIDEO_SECONDS).end}
                duration={duration}
                track={track}
                onMove={moveLast}
              />
            </div>
          </div>

          {failed ? (
            <p role="alert" className="text-[13px] text-destructive">
              This video can&apos;t be played here, so the part can&apos;t be previewed.
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} className="h-10 rounded-full px-4">
              Cancel
            </Button>
            <Button type="button" onClick={() => onApply(coversWhole(win, duration) ? null : win)} className="h-10 rounded-full px-5">
              Use this part
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
