"use client"

import { useId, useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { DIALOG_CLOSE_PHONE, DIALOG_FIT } from "@/components/app/overlay-sizes"
import { TabFill } from "@/components/app/tabs"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { COMMON_LANGUAGE_CODES, LANGUAGES, SPEAK_LEVELS, type SpeakLevel } from "@/lib/languages"
import { AREA_MAX, COUNTRIES, REGION_MAX } from "@/lib/places"
import { cn } from "@/lib/utils"

// The fields for where someone is and what they speak. Used by sign-up setup and by Settings, so both read the same.

export const FIELD =
  "h-12 w-full min-w-0 rounded-xl border border-border bg-card px-4 text-base outline-none transition-colors duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/30 focus:border-foreground"

export const SMALL_FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3.5 text-base outline-none transition-colors duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/30 focus:border-foreground"

export function Label({ htmlFor, children, aside }: { htmlFor?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-5 items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {children}
      </label>
      {aside}
    </div>
  )
}

// A switch that is the whole row, so a tap anywhere on it turns it on or off.
export function SwitchRow({
  id,
  checked,
  onChange,
  title,
  hint,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  hint: string
}) {
  return (
    <label
      htmlFor={id}
      className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors duration-200 hover:border-foreground/30"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] leading-snug text-muted-foreground">{hint}</span>
      </span>
      <span className="relative inline-flex h-6 w-10 shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-border transition-colors duration-200 peer-checked:bg-dusk peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-[3px] left-[3px] size-[18px] rounded-full bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]",
            checked && "translate-x-4"
          )}
        />
      </span>
    </label>
  )
}

export type WhereValue = { country: string; area: string; region: string; suggestNearby: boolean }

// The country, chosen from a popup with a search box. The popup closes as soon as a country is picked.
function CountryPicker({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const name = COUNTRIES.find((country) => country.code === value)?.name ?? null
  const shown = useMemo(() => {
    const text = query.trim().toLowerCase()
    return text === "" ? COUNTRIES : COUNTRIES.filter((country) => country.name.toLowerCase().includes(text))
  }, [query])
  return (
    <>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery("")
          setOpen(true)
        }}
        className={cn(FIELD, "flex items-center justify-between gap-3 text-left")}
      >
        <span className={cn("truncate", name === null && "text-muted-foreground/70")}>{name ?? "Choose a country"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.9} aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn("sm:max-w-md", DIALOG_CLOSE_PHONE, DIALOG_FIT)}>
          <DialogTitle className="text-base font-semibold">Choose a country</DialogTitle>
          <DialogDescription className="sr-only">Type to narrow the list, then pick your country.</DialogDescription>
          <input
            type="search"
            aria-label="Search countries"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            autoComplete="off"
            className={SMALL_FIELD}
          />
          <ul aria-label="Countries" className="-mx-2 flex max-h-[52dvh] flex-col overflow-y-auto">
            {shown.map((country) => {
              const chosen = country.code === value
              return (
                <li key={country.code}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => {
                      onChange(country.code)
                      setOpen(false)
                    }}
                    className="flex h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[15px] transition-colors duration-200 outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">{country.name}</span>
                    {chosen ? <Check className="size-4 shrink-0" strokeWidth={2.2} aria-hidden="true" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
          {shown.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">No country matches that.</p> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

// Where someone is for suggestions: the country from a popup, then the city and the state or region it sits in.
export function WhereFields({ value, onChange }: { value: WhereValue; onChange: (next: WhereValue) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="where-country">Country</Label>
        <CountryPicker id="where-country" value={value.country} onChange={(country) => onChange({ ...value, country })} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="where-area"
            aside={value.area.length >= AREA_MAX - 6 ? <span className="text-[13px] tabular-nums text-muted-foreground">{value.area.length}/{AREA_MAX}</span> : null}
          >
            City or town
          </Label>
          <input
            id="where-area"
            value={value.area}
            maxLength={AREA_MAX}
            autoComplete="address-level2"
            placeholder="Brisbane"
            onChange={(event) => onChange({ ...value, area: event.target.value })}
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="where-region">State or region</Label>
          <input
            id="where-region"
            value={value.region}
            maxLength={REGION_MAX}
            autoComplete="address-level1"
            placeholder="Queensland"
            onChange={(event) => onChange({ ...value, region: event.target.value })}
            className={FIELD}
          />
        </div>
      </div>
      <SwitchRow
        id="where-nearby"
        checked={value.suggestNearby}
        onChange={(checked) => onChange({ ...value, suggestNearby: checked })}
        title="Suggest me to people nearby"
        hint="Only people nearby who turn this on too."
      />
    </div>
  )
}

export type SpeakItem = { code: string; level: SpeakLevel }
export type LanguageValue = { speak: SpeakItem[]; learn: string[]; suggestLanguage: boolean }

type Tab = "speak" | "learn"

// Two lists: the languages a person speaks, each with a level, and the ones they are learning. A language is in one
// list only. The tabs choose which list a tap changes; the chips show what is in each.
export function LanguageFields({ value, onChange }: { value: LanguageValue; onChange: (next: LanguageValue) => void }) {
  const [tab, setTab] = useState<Tab>("speak")
  const id = useId()
  const [query, setQuery] = useState("")
  const spoken = useMemo(() => new Set(value.speak.map((item) => item.code)), [value.speak])
  const learning = useMemo(() => new Set(value.learn), [value.learn])
  // With nothing typed, the most spoken languages. Typing searches every language.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return COMMON_LANGUAGE_CODES.flatMap((code) => LANGUAGES.filter((language) => language.code === code))
    return LANGUAGES.filter((language) => language.name.toLowerCase().includes(needle) || language.native.toLowerCase().includes(needle))
  }, [query])

  function toggle(code: string) {
    if (tab === "speak") {
      if (spoken.has(code)) {
        onChange({ ...value, speak: value.speak.filter((item) => item.code !== code) })
      } else {
        onChange({ ...value, speak: [...value.speak, { code, level: "fluent" }], learn: value.learn.filter((item) => item !== code) })
      }
    } else if (learning.has(code)) {
      onChange({ ...value, learn: value.learn.filter((item) => item !== code) })
    } else {
      onChange({ ...value, learn: [...value.learn, code], speak: value.speak.filter((item) => item.code !== code) })
    }
  }

  function setLevel(code: string, level: SpeakLevel) {
    onChange({ ...value, speak: value.speak.map((item) => (item.code === code ? { ...item, level } : item)) })
  }

  const nameOf = (code: string) => LANGUAGES.find((language) => language.code === code)?.name ?? code
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "speak", label: "I speak", count: value.speak.length },
    { id: "learn", label: "I'm learning", count: value.learn.length },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Language lists" className="grid grid-cols-2 gap-1 rounded-full border border-border p-1">
        {tabs.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "relative h-10 rounded-full text-[14px] font-semibold transition-colors duration-200",
                active ? "text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active ? <TabFill layoutId={`${id}-fill`} /> : null}
              <span className="relative inline-flex items-center gap-1.5">
                {item.label}
                {item.count > 0 ? <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground")}>{item.count}</span> : null}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3">
        <input
          id="language-search"
          type="search"
          value={query}
          placeholder="Search languages"
          aria-label="Search languages"
          onChange={(event) => setQuery(event.target.value)}
          className={SMALL_FIELD}
        />
        <ul aria-label="Languages" className="flex flex-wrap gap-2">
          {shown.map((language) => {
            const inTab = tab === "speak" ? spoken.has(language.code) : learning.has(language.code)
            const inOther = tab === "speak" ? learning.has(language.code) : spoken.has(language.code)
            const native = language.native.toLowerCase() !== language.name.toLowerCase()
            return (
              <li key={language.code}>
                <button
                  type="button"
                  aria-pressed={inTab}
                  onClick={() => toggle(language.code)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-[background-color,border-color,color] duration-200",
                    inTab
                      ? "border-foreground bg-foreground text-background"
                      : inOther
                        ? "border-foreground/60 text-foreground hover:bg-foreground/5"
                        : "border-border hover:border-foreground/30 hover:bg-foreground/5"
                  )}
                >
                  {inTab ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
                  <span>{language.name}</span>
                  {native ? <span className={cn("text-[13px]", inTab ? "text-background/70" : "text-muted-foreground")}>{language.native}</span> : null}
                  {inOther ? <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
        {shown.length === 0 ? <p className="py-4 text-center text-[14px] text-muted-foreground">No language matches that.</p> : null}
        {query.trim() === "" ? (
          <p className="text-[13px] text-muted-foreground">Most spoken. Search for the rest.</p>
        ) : null}
      </div>

      {value.speak.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">How well</p>
          <ul className="flex flex-col gap-2">
            {value.speak.map((item) => (
              <li key={item.code} className="flex items-center gap-3 rounded-xl border border-border bg-card py-2 pr-2 pl-4">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{nameOf(item.code)}</span>
                <label htmlFor={`level-${item.code}`} className="sr-only">
                  How well you speak {nameOf(item.code)}
                </label>
                <select
                  id={`level-${item.code}`}
                  value={item.level}
                  onChange={(event) => setLevel(item.code, event.target.value as SpeakLevel)}
                  className="h-9 rounded-lg border border-border bg-background px-2.5 text-[14px] outline-none transition-colors hover:border-foreground/30 focus:border-foreground"
                >
                  {SPEAK_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => toggle(item.code)}
                  aria-label={`Remove ${nameOf(item.code)}`}
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <span aria-hidden="true" className="text-lg leading-none">×</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <SwitchRow
        id="language-partners"
        checked={value.suggestLanguage}
        onChange={(checked) => onChange({ ...value, suggestLanguage: checked })}
        title="Suggest me as a language partner"
        hint="Only people who also turn this on see you."
      />
    </div>
  )
}
