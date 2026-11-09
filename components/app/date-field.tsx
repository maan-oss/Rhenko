"use client"

import { useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { SHEET_SETTLE, SPRING_SELECT, SPRING_SHEET } from "@/components/app/motion"
import { cn } from "@/lib/utils"

// A date picker. The field is a control of its own and stays where it is. Tapping it rises a drawer from the bottom edge that
// holds only the calendar: the page behind it dims, and the drawer keeps one size, so months and the year list never resize
// it. The field shows each pick as it is made and sits above the dimming. If the drawer would cover the field, the form lifts
// by the amount needed (reported through onSheetChange) and lowers again on close. The value is posted as YYYY-MM-DD.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const FIRST_YEAR = 1900

// The drawer's fixed layout, in pixels. Six week rows fit every month, and the year list takes the same room as the days.
const CELL = 44
const ROW_GAP = 4
const GRID_HEIGHT = 6 * CELL + 5 * ROW_GAP
const WEEKDAY_HEIGHT = 28
const BODY_HEIGHT = WEEKDAY_HEIGHT + GRID_HEIGHT
// Handle 22, gap 8, month row 44, gap 4, the body, then 20 below. A home indicator's space is added under this, not taken from it.
const SHEET_HEIGHT = 22 + 8 + 44 + 4 + BODY_HEIGHT + 20
// The least space kept between the field and the drawer's top edge when the form lifts for it.
const CLEARANCE = 12

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
// After a day is picked, the field shows the new date for a moment before the drawer lowers.
const CLOSE_AFTER_PICK_MS = 260

type Parts = { year: number; month: number; day: number }

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

const noopSubscribe = () => () => {}
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false)
}

// `variant` picks the look: "pill" is the round field with its icon on the left, and "card" is a full-shape field with its icon
// on the right. `invalid` draws the field in the error colour. `label` names the field for screen readers once a date is chosen.
// `onSheetChange` tells the form when the drawer opens, and by how much it must lift to keep the field above the drawer.
export function DateField({
  id,
  name,
  label,
  defaultValue = "",
  placeholder = "Pick a date",
  max,
  invalid = false,
  onChange,
  onSheetChange,
  variant = "pill",
}: {
  id: string
  name: string
  label?: string
  defaultValue?: string
  placeholder?: string
  max?: string
  invalid?: boolean
  onChange?: (value: string) => void
  onSheetChange?: (open: boolean, lift: number) => void
  variant?: "pill" | "card"
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef({ y: 0, time: 0 })
  const pickTimer = useRef<number | undefined>(undefined)
  const shown = selected ? readable(selected) : placeholder

  useEffect(() => {
    const timer = pickTimer
    return () => window.clearTimeout(timer.current)
  }, [])

  // The form learns when the drawer opens and how far it must lift. The lift is measured once the drawer is laid out. Its
  // container is never transformed (only the panel inside rises), so the container's top edge is where the drawer rests.
  const tellForm = useEffectEvent((isOpen: boolean, lift: number) => onSheetChange?.(isOpen, lift))
  useLayoutEffect(() => {
    if (!open) {
      tellForm(false, 0)
      return
    }
    const drawerTop = containerRef.current?.getBoundingClientRect().top ?? window.innerHeight - SHEET_HEIGHT
    // The whole field is kept clear, so the drawer never covers any of it.
    const fieldBottom = triggerRef.current?.getBoundingClientRect().bottom ?? 0
    tellForm(true, Math.max(0, fieldBottom + CLEARANCE - drawerTop))
  }, [open])
  useEffect(() => () => tellForm(false, 0), [])

  const close = useCallback(() => {
    setOpen(false)
    setYearList(false)
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  function openSheet() {
    const start = selected ?? maxParts
    setView({ year: start.year, month: start.month })
    setDirection(0)
    setDragY(0)
    setYearList(false)
    setOpen(true)
  }

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

  // The handle can be dragged down to dismiss the drawer. Nothing else in it moves.
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

  const drawer = (
    <motion.div
      key="drawer"
      ref={containerRef}
      className="fixed inset-x-0 bottom-0 z-[90] mx-auto w-full max-w-[420px]"
      style={{ height: `calc(${SHEET_HEIGHT}px + env(safe-area-inset-bottom, 0px))` }}
    >
      <motion.div
        ref={panelRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a date"
        tabIndex={-1}
        initial={{ y: "100%" }}
        animate={{ y: dragY }}
        exit={{ y: "100%", transition: reduce ? { duration: 0 } : SHEET_SETTLE }}
        transition={dragging || reduce ? { duration: 0 } : SPRING_SHEET}
        className="flex h-full flex-col rounded-t-[32px] border-x border-t border-border bg-popover px-5 text-popover-foreground shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.2)] outline-none"
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

        <div className="mt-2 flex h-11 shrink-0 items-center justify-between">
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

        {/* A body of one fixed height. The month slides inside it and the year list takes its place, so nothing resizes. */}
        <div className="mt-1 shrink-0" style={{ height: BODY_HEIGHT }}>
          {yearList ? (
            <div className="grid h-full grid-cols-4 content-start gap-1.5 overflow-y-auto pr-1">
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
            <div className="flex h-full flex-col">
              <div className="grid shrink-0 grid-cols-7 items-center text-center text-xs font-medium text-muted-foreground" style={{ height: WEEKDAY_HEIGHT }}>
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
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
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )

  const icon = <CalendarDays className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
  // The card's label sits in the middle while the field is empty and rises to the top once a date is chosen or the calendar
  // opens. The date is shown beneath it, so the card reads as the same floating field as the others.
  const floated = open || Boolean(selected)
  const value = variant === "card" && !selected ? "" : shown

  return (
    // While open, the field is raised above the dimming layer, so the value stays readable and in place.
    <div className={cn("relative", open && "z-[85]")}>
      <input type="hidden" name={name} value={selected ? format(selected) : ""} />
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-label={label && selected ? `${label}: ${shown}` : undefined}
        onClick={openSheet}
        className={cn(
          "flex w-full items-center gap-3 text-left outline-none",
          variant === "card"
            ? cn(
                "relative h-16 rounded-[20px] border bg-card px-5 text-[17px] transition-[border-color,box-shadow] duration-200 hover:border-foreground/25 focus-visible:shadow-[0_0_0_3px_var(--halo)]",
                invalid ? "border-destructive" : "border-border"
              )
            : "h-12 rounded-full bg-muted px-5 text-base transition-[background-color] duration-200 hover:bg-foreground/[0.06] focus:bg-background focus:shadow-[0_0_0_3px_var(--halo)]"
        )}
      >
        {variant === "pill" ? icon : null}
        {variant === "card" ? (
          <span
            className={cn(
              "pointer-events-none absolute left-5 text-muted-foreground transition-[top,translate,font-size,line-height] duration-200",
              floated ? "top-2 text-[13px] leading-4" : "top-1/2 -translate-y-1/2 leading-6"
            )}
          >
            {label ?? placeholder}
          </span>
        ) : null}
        <span className={cn("min-w-0", variant === "card" ? "absolute inset-x-5 top-[calc(50%+10px)] -translate-y-1/2 pr-7" : "relative flex-1")}>
          {/* A new value fades up in place of the old one, so a pick reads as a change rather than a jump. */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={pageTransition}
              className={cn("block whitespace-nowrap", selected ? "text-foreground" : "text-muted-foreground")}
            >
              {value}
            </motion.span>
          </AnimatePresence>
        </span>
        {variant === "card" ? <span className="ml-auto flex">{icon}</span> : null}
      </button>

      {mounted
        ? createPortal(
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
              {open ? drawer : null}
            </AnimatePresence>,
            document.body
          )
        : null}
    </div>
  )
}
