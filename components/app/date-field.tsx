"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { SHEET_SETTLE, SPRING_SELECT, SPRING_SHEET } from "@/components/app/motion"
import { cn } from "@/lib/utils"

// A date picker in a drawer. Tapping the field lifts its value out of the field and into a card at the top of a drawer, which
// rises from the bottom edge. The card sits above the calendar, not inside it, and shows each change as a date is picked.
// Closing flies the value back into the field and lowers the drawer. The drawer has one fixed size, so months, years and the
// year list never resize it. The value is submitted as YYYY-MM-DD in a hidden input.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const FIRST_YEAR = 1900

// The drawer's fixed layout, in pixels. Six week rows fit every month, and the year list takes the same room as the days.
const CELL = 44
const ROW_GAP = 4
const GRID_HEIGHT = 6 * CELL + 5 * ROW_GAP
const WEEKDAY_HEIGHT = 28
const BODY_HEIGHT = WEEKDAY_HEIGHT + GRID_HEIGHT
// Handle 22, gap 16, value card 76, gap 20, month row 44 with 4 below, body, and 20 of bottom space.
const SHEET_HEIGHT = 22 + 16 + 76 + 20 + 44 + 4 + BODY_HEIGHT + 20

const SLIDE = { duration: 0.28, ease: [0.2, 0.7, 0.2, 1] } as const
const SLIDE_DISTANCE = 28
const PAGE = {
  enter: (direction: number) => ({ x: direction * SLIDE_DISTANCE, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -SLIDE_DISTANCE, opacity: 0 }),
}

// A pull down this far, or this fast, dismisses the drawer. Otherwise it springs back.
const PUSH_DOWN_DISTANCE = 110
const PUSH_DOWN_SPEED = 0.6
// After a day is picked, the card shows the new date for a moment before the drawer lowers.
const CLOSE_AFTER_PICK_MS = 260
// The drawer rests so its value line sits LIFT pixels above the field's value, so the value glides up into the card. The value
// line is VALUE_LINE_IN_SHEET pixels below the drawer's top edge.
const LIFT = 40
const VALUE_LINE_IN_SHEET = 73

type Parts = { year: number; month: number; day: number }
type Box = { x: number; y: number; w: number; h: number }
// The value in flight between the field and the card. `to` is measured once the drawer is in place.
type Flight = { id: number; kind: "open" | "close"; from: Box; to: Box | null; text: string; color: string }

function parse(value: string): Parts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
}

function format(parts: Parts): string {
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

function readable(parts: Parts): string {
  return `${parts.day} ${MONTHS[parts.month]} ${parts.year}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// Monday is the first column.
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
}

const noopSubscribe = () => () => {}
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// `bare` drops the pill and the icon, for a date in a row of a grouped form, where the row's label names the field.
export function DateField({
  id,
  name,
  label = "Date",
  defaultValue = "",
  placeholder = "Pick a date",
  max,
  onChange,
  bare = false,
}: {
  id: string
  name: string
  label?: string
  defaultValue?: string
  placeholder?: string
  max?: string
  onChange?: (value: string) => void
  bare?: boolean
}) {
  const dialogId = useId()
  const mounted = useMounted()
  const reduce = useReducedMotion()
  const today = new Date()
  const maxParts = parse(max ?? "") ?? { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() }
  const [selected, setSelected] = useState<Parts | null>(() => parse(defaultValue))
  const [open, setOpen] = useState(false)
  const [yearList, setYearList] = useState(false)
  const [direction, setDirection] = useState(0)
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const start = parse(defaultValue) ?? maxParts
    return { year: start.year, month: start.month }
  })
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flight, setFlight] = useState<Flight | null>(null)
  // Where the drawer rests from the top of the screen, and how far below that it starts before it rises.
  // `flush` drawers reach the bottom edge of the screen; a drawer lifted high enough to float keeps all its corners rounded.
  const [anchor, setAnchor] = useState({ top: 0, rise: 0, flush: true })
  const flightCount = useRef(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const triggerValueRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const cardValueRef = useRef<HTMLSpanElement>(null)
  const dragStart = useRef({ y: 0, time: 0 })
  const pickTimer = useRef<number | undefined>(undefined)
  const shown = selected ? readable(selected) : placeholder

  useEffect(() => {
    const timer = pickTimer
    return () => window.clearTimeout(timer.current)
  }, [])

  // Closing starts the value flying from the card back to the field, and the drawer lowers at the same time.
  const close = useCallback(() => {
    const card = cardValueRef.current
    const trigger = triggerValueRef.current
    if (card && trigger) {
      flightCount.current += 1
      setFlight({
        id: flightCount.current,
        kind: "close",
        from: boxOf(card),
        to: boxOf(trigger),
        text: card.textContent ?? "",
        color: getComputedStyle(card).color,
      })
    }
    setOpen(false)
    setYearList(false)
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  // Opening starts the value flying out of the field. Its landing spot is measured once the drawer is laid out.
  function openSheet() {
    const start = selected ?? maxParts
    setView({ year: start.year, month: start.month })
    setDirection(0)
    setDragY(0)
    setYearList(false)
    const trigger = triggerValueRef.current
    if (trigger) {
      const triggerTop = trigger.getBoundingClientRect().top
      const top = Math.max(12, Math.min(triggerTop - LIFT - VALUE_LINE_IN_SHEET, window.innerHeight - SHEET_HEIGHT - 12))
      setAnchor({ top, rise: window.innerHeight - top, flush: top + SHEET_HEIGHT > window.innerHeight - 40 })
      flightCount.current += 1
      setFlight({
        id: flightCount.current,
        kind: "open",
        from: boxOf(trigger),
        to: null,
        text: trigger.textContent ?? "",
        color: getComputedStyle(trigger).color,
      })
    }
    setOpen(true)
  }

  // The drawer's container does not move, so its position and the card's offsets are the drawer's resting place. The panel
  // inside it is the part that rises, so the card's position is read from offsets, which ignore that motion.
  useLayoutEffect(() => {
    if (!flight || flight.kind !== "open" || flight.to) return
    const container = containerRef.current
    const panel = panelRef.current
    const value = cardValueRef.current
    if (!container || !panel || !value) return
    const containerRect = container.getBoundingClientRect()
    setFlight({
      ...flight,
      to: {
        x: containerRect.left + panel.clientLeft + value.offsetLeft,
        y: containerRect.top + panel.clientTop + value.offsetTop,
        w: value.offsetWidth,
        h: value.offsetHeight,
      },
    })
  }, [flight])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [open, close])

  function isAfterMax(year: number, month: number, day: number): boolean {
    if (year !== maxParts.year) return year > maxParts.year
    if (month !== maxParts.month) return month > maxParts.month
    return day > maxParts.day
  }

  function shiftMonth(delta: number) {
    setDirection(delta)
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  function choose(day: number) {
    const parts = { year: view.year, month: view.month, day }
    setSelected(parts)
    onChange?.(format(parts))
    window.clearTimeout(pickTimer.current)
    pickTimer.current = window.setTimeout(() => {
      pickTimer.current = undefined
      close()
    }, CLOSE_AFTER_PICK_MS)
  }

  // The grab handle can be dragged down to dismiss the drawer. Nothing else in it moves or resizes.
  function handleDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { y: event.clientY, time: event.timeStamp }
    setDragging(true)
  }

  function handleMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragging) setDragY(Math.max(0, event.clientY - dragStart.current.y))
  }

  function handleUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    const dy = event.clientY - dragStart.current.y
    const speed = dy / Math.max(1, event.timeStamp - dragStart.current.time)
    setDragging(false)
    if (dy > PUSH_DOWN_DISTANCE || speed > PUSH_DOWN_SPEED) close()
    else setDragY(0)
  }

  const blanks = leadingBlanks(view.year, view.month)
  const count = daysInMonth(view.year, view.month)
  const cells: (number | null)[] = [...Array.from({ length: blanks }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)]
  const years: number[] = []
  for (let year = maxParts.year; year >= FIRST_YEAR; year--) years.push(year)
  const pageTransition = reduce ? { duration: 0 } : SLIDE

  // The field is hidden while the drawer is open or the value is in flight, so the value is only ever in one place.
  const fieldValueVisible = !open && !flight
  const cardValueVisible = open && !flight

  const ghost =
    flight && flight.to ? (
      <motion.div
        key={flight.id}
        data-date-flight=""
        aria-hidden="true"
        initial={{ x: 0, y: 0 }}
        animate={{ x: flight.to.x - flight.from.x, y: flight.to.y - flight.from.y }}
        transition={reduce ? { duration: 0 } : SPRING_SHEET}
        onAnimationComplete={() => setFlight(null)}
        style={{
          position: "fixed",
          left: flight.from.x,
          top: flight.from.y,
          width: flight.from.w,
          height: flight.from.h,
          zIndex: 95,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          fontSize: 17,
          lineHeight: "24px",
          color: flight.color,
        }}
      >
        {flight.text}
      </motion.div>
    ) : null

  const sheet = (
    <motion.div
      key="sheet"
      ref={containerRef}
      className="fixed inset-x-0 z-[90] mx-auto w-full max-w-[420px]"
      style={{
        top: anchor.top,
        ...(anchor.flush ? { bottom: 0 } : { height: `calc(${SHEET_HEIGHT}px + env(safe-area-inset-bottom, 0px))` }),
      }}
    >
      <motion.div
        ref={panelRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a date"
        tabIndex={-1}
        initial={{ y: anchor.rise }}
        animate={{ y: dragY }}
        exit={{ y: anchor.rise, transition: SHEET_SETTLE }}
        transition={dragging || reduce ? { duration: 0 } : SPRING_SHEET}
        className={cn(
          "absolute inset-0 flex flex-col border-border bg-popover px-5 text-popover-foreground shadow-[0_-30px_70px_-20px_rgba(0,0,0,0.5)] outline-none",
          anchor.flush ? "rounded-t-[32px] border-x border-t" : "rounded-[32px] border"
        )}
      >
        <div
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          className="flex h-[22px] shrink-0 cursor-grab touch-none justify-center pt-2.5 active:cursor-grabbing"
        >
          <span aria-hidden="true" className="h-1.5 w-11 rounded-full bg-foreground/20" />
        </div>

        <div className="mt-4 flex h-[76px] shrink-0 flex-col justify-center rounded-[20px] border border-border bg-card px-4">
          <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
          <span
            ref={cardValueRef}
            data-date-value="card"
            style={{ visibility: cardValueVisible ? "visible" : "hidden" }}
            className={cn("mt-0.5 block whitespace-nowrap text-[17px] leading-6", selected ? "text-foreground" : "text-muted-foreground")}
          >
            <motion.span
              key={shown}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={pageTransition}
              className="block"
            >
              {shown}
            </motion.span>
          </span>
        </div>

        <div className="mt-5 mb-1 flex h-11 shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="grid size-11 place-items-center rounded-full transition-colors hover:bg-muted"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setYearList((value) => !value)}
            aria-expanded={yearList}
            className="rounded-full px-3 py-1.5 text-[15px] font-semibold transition-colors hover:bg-muted"
          >
            {MONTHS[view.month]} {view.year}
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            disabled={view.year > maxParts.year || (view.year === maxParts.year && view.month >= maxParts.month)}
            className="grid size-11 place-items-center rounded-full transition-colors hover:bg-muted disabled:opacity-50"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {yearList ? (
          <div className="grid shrink-0 grid-cols-4 content-start gap-1.5 overflow-y-auto pr-1" style={{ height: BODY_HEIGHT }}>
            {years.map((year) => (
              <button
                key={year}
                type="button"
                aria-pressed={year === view.year}
                onClick={() => {
                  setDirection(0)
                  setView((current) => ({ year, month: current.month }))
                  setYearList(false)
                }}
                className={cn(
                  "rounded-full py-2 text-sm font-medium tabular-nums transition-colors",
                  year === view.year ? "bg-foreground text-background" : "hover:bg-muted"
                )}
              >
                {year}
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="grid shrink-0 grid-cols-7 items-center text-center text-xs font-medium text-muted-foreground" style={{ height: WEEKDAY_HEIGHT }}>
              {WEEKDAYS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            {/* A fixed window the month slides in and out of. Its height never changes, so the drawer does not either. */}
            <div className="relative shrink-0 overflow-hidden" style={{ height: GRID_HEIGHT }}>
              <AnimatePresence initial={false} custom={direction}>
                <motion.div
                  key={`${view.year}-${view.month}`}
                  custom={direction}
                  variants={PAGE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={pageTransition}
                  className="absolute inset-0 grid grid-cols-7 text-center"
                  style={{ gridTemplateRows: `repeat(6, ${CELL}px)`, rowGap: ROW_GAP }}
                >
                  {cells.map((day, index) => {
                    if (day === null) return <span key={`blank-${index}`} />
                    const disabled = isAfterMax(view.year, view.month, day)
                    const isSelected =
                      selected !== null && selected.year === view.year && selected.month === view.month && selected.day === day
                    const isToday =
                      today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={disabled}
                        onClick={() => choose(day)}
                        aria-label={`${day} ${MONTHS[view.month]} ${view.year}`}
                        aria-pressed={isSelected}
                        className={cn(
                          "relative isolate mx-auto grid size-11 place-items-center rounded-full text-[15px] tabular-nums transition-colors",
                          isSelected ? "font-semibold text-background" : "text-foreground hover:bg-muted",
                          disabled && "pointer-events-none opacity-30"
                        )}
                      >
                        {isSelected ? (
                          <motion.span
                            layoutId={`${id}-day`}
                            aria-hidden="true"
                            initial={{ scale: 0.6 }}
                            animate={{ scale: 1 }}
                            transition={reduce ? { duration: 0 } : SPRING_SELECT}
                            className="absolute inset-0 -z-10 rounded-full bg-foreground"
                          />
                        ) : null}
                        {isToday && !isSelected ? (
                          <span aria-hidden="true" className="absolute inset-0 rounded-full ring-1 ring-inset ring-foreground/40" />
                        ) : null}
                        {day}
                      </button>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )

  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected ? format(selected) : ""} />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={openSheet}
        className={cn(
          "flex w-full items-center gap-3 text-left outline-none",
          bare
            ? "h-7 text-[17px]"
            : "h-12 rounded-full bg-muted px-5 text-base transition-[background-color] duration-200 hover:bg-foreground/[0.06] focus:bg-background focus:shadow-[0_0_0_3px_var(--halo)]"
        )}
      >
        {bare ? null : <CalendarDays className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />}
        <span className="min-w-0 flex-1">
          <span
            ref={triggerValueRef}
            data-date-value="trigger"
            style={{ visibility: fieldValueVisible ? "visible" : "hidden" }}
            className={cn("block whitespace-nowrap", selected ? "text-foreground" : "text-muted-foreground")}
          >
            {shown}
          </span>
        </span>
      </button>

      {mounted
        ? createPortal(
            <>
              <AnimatePresence>
                {open ? (
                  <motion.div
                    key="scrim"
                    aria-hidden="true"
                    onClick={close}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
                    className="fixed inset-0 z-[80] bg-foreground/30 backdrop-blur-[3px]"
                  />
                ) : null}
                {open ? sheet : null}
              </AnimatePresence>
              <AnimatePresence>{ghost}</AnimatePresence>
            </>,
            document.body
          )
        : null}
    </div>
  )
}
