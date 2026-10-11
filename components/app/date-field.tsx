"use client"

import { useEffect, useId, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// A date picker with its own calendar, so it looks the same on every browser. The value
// is submitted as YYYY-MM-DD in a hidden input.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const FIRST_YEAR = 1900

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

export function DateField({
  id,
  name,
  defaultValue = "",
  placeholder = "Pick a date",
  max,
}: {
  id: string
  name: string
  defaultValue?: string
  placeholder?: string
  max?: string
}) {
  const panelId = useId()
  const today = new Date()
  const maxParts = parse(max ?? "") ?? { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() }
  const [selected, setSelected] = useState<Parts | null>(() => parse(defaultValue))
  const [open, setOpen] = useState(false)
  const [yearList, setYearList] = useState(false)
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const start = parse(defaultValue) ?? maxParts
    return { year: start.year, month: start.month }
  })
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function isAfterMax(year: number, month: number, day: number): boolean {
    if (year !== maxParts.year) return year > maxParts.year
    if (month !== maxParts.month) return month > maxParts.month
    return day > maxParts.day
  }

  function shiftMonth(delta: number) {
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  function choose(day: number) {
    const parts = { year: view.year, month: view.month, day }
    setSelected(parts)
    setOpen(false)
    setYearList(false)
  }

  const blanks = leadingBlanks(view.year, view.month)
  const count = daysInMonth(view.year, view.month)
  const cells: (number | null)[] = [...Array.from({ length: blanks }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)]
  const years: number[] = []
  for (let year = maxParts.year; year >= FIRST_YEAR; year--) years.push(year)

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={selected ? format(selected) : ""} />
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="group flex h-12 w-full items-center gap-3 rounded-2xl border border-border bg-background px-4 text-left text-[15px] transition-colors hover:border-muted-foreground/60 focus-visible:border-foreground focus-visible:outline-none aria-expanded:border-foreground"
      >
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className={cn("flex-1", selected ? "text-foreground" : "text-muted-foreground")}>
          {selected ? readable(selected) : placeholder}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose a date"
          className="absolute top-full left-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-3xl border border-border bg-popover p-4 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="grid size-9 place-items-center rounded-full transition-colors hover:bg-muted"
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
              className="grid size-9 place-items-center rounded-full transition-colors hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {yearList ? (
            <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  aria-pressed={year === view.year}
                  onClick={() => {
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
              <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="py-1.5">
                    {day}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {cells.map((day, index) => {
                  if (day === null) return <span key={`blank-${index}`} />
                  const disabled = isAfterMax(view.year, view.month, day)
                  const isSelected = selected !== null && selected.year === view.year && selected.month === view.month && selected.day === day
                  const isToday = today.getFullYear() === view.year && today.getMonth() === view.month && today.getDate() === day
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={disabled}
                      onClick={() => choose(day)}
                      aria-label={`${day} ${MONTHS[view.month]} ${view.year}`}
                      aria-pressed={isSelected}
                      className={cn(
                        "mx-auto grid size-9 place-items-center rounded-full text-sm tabular-nums transition-colors",
                        isSelected ? "bg-foreground font-semibold text-background" : "hover:bg-muted",
                        isToday && !isSelected && "font-semibold underline underline-offset-4",
                        disabled && "pointer-events-none opacity-30"
                      )}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
