"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { COMMON_LANGUAGE_CODES, LANGUAGES, SPEAK_LEVELS, type SpeakLevel } from "@/lib/languages"
import { AREA_MAX, COUNTRIES } from "@/lib/places"
import { cn } from "@/lib/utils"

// The fields for where someone is and what they speak. Used by sign-up setup and by Settings, so both read the same.

export const FIELD =
  "h-12 w-full min-w-0 rounded-2xl border border-border bg-background px-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"

export const SMALL_FIELD =
  "h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[15px] outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 focus:border-foreground"

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {children}
      </label>
      {hint ? <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

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
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border px-4 py-3.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-[3px] size-4 shrink-0 cursor-pointer accent-foreground"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-semibold">{title}</span>
        <span className="text-[13px] leading-relaxed text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}

export type WhereValue = { country: string; area: string; suggestNearby: boolean }

export function WhereFields({ value, onChange }: { value: WhereValue; onChange: (next: WhereValue) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="where-country">Country</Label>
        <select
          id="where-country"
          value={value.country}
          onChange={(event) => onChange({ ...value, country: event.target.value })}
          className={cn(FIELD, "appearance-auto pr-3")}
        >
          <option value="">Choose a country</option>
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="where-area" hint="A city or town only. Never a street address or postcode.">
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
      <SwitchRow
        id="where-nearby"
        checked={value.suggestNearby}
        onChange={(checked) => onChange({ ...value, suggestNearby: checked })}
        title="Suggest me to people nearby"
        hint="Only shown to people nearby who turn this on too. Your town is never on your profile."
      />
    </div>
  )
}

export type SpeakItem = { code: string; level: SpeakLevel }
export type LanguageValue = { speak: SpeakItem[]; learn: string[]; suggestLanguage: boolean }

const CHIP_BASE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors duration-200"
const CHIP_ON = "border-foreground bg-foreground text-background"
const CHIP_OFF = "border-border hover:bg-foreground/5"

// Two lists of languages: the ones spoken (each with a level) and the ones being learned. A language is in one list
// only, so choosing it in one takes it out of the other.
export function LanguageFields({ value, onChange }: { value: LanguageValue; onChange: (next: LanguageValue) => void }) {
  const [query, setQuery] = useState("")
  const spoken = useMemo(() => new Set(value.speak.map((item) => item.code)), [value.speak])
  const learning = useMemo(() => new Set(value.learn), [value.learn])
  // With nothing typed, the most spoken languages. Typing searches every language.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return COMMON_LANGUAGE_CODES.flatMap((code) => LANGUAGES.filter((language) => language.code === code))
    return LANGUAGES.filter((language) => language.name.toLowerCase().includes(needle) || language.native.toLowerCase().includes(needle))
  }, [query])

  function toggleSpeak(code: string) {
    if (spoken.has(code)) {
      onChange({ ...value, speak: value.speak.filter((item) => item.code !== code) })
    } else {
      onChange({ ...value, speak: [...value.speak, { code, level: "fluent" }], learn: value.learn.filter((item) => item !== code) })
    }
  }

  function toggleLearn(code: string) {
    if (learning.has(code)) {
      onChange({ ...value, learn: value.learn.filter((item) => item !== code) })
    } else {
      onChange({ ...value, learn: [...value.learn, code], speak: value.speak.filter((item) => item.code !== code) })
    }
  }

  function setLevel(code: string, level: SpeakLevel) {
    onChange({ ...value, speak: value.speak.map((item) => (item.code === code ? { ...item, level } : item)) })
  }

  const nameOf = (code: string) => LANGUAGES.find((language) => language.code === code)?.name ?? code

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Label htmlFor="language-search">Find a language</Label>
        <input
          id="language-search"
          type="search"
          value={query}
          placeholder="Search by name"
          onChange={(event) => setQuery(event.target.value)}
          className={SMALL_FIELD}
        />
        {query.trim() === "" ? <p className="text-[13px] text-muted-foreground">The most spoken. Search for any other.</p> : null}
        <ul aria-label="Languages" className="flex max-h-72 flex-col overflow-y-auto rounded-2xl border border-border">
          {shown.map((language) => {
            const isSpoken = spoken.has(language.code)
            const isLearning = learning.has(language.code)
            return (
              <li key={language.code} className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{language.name}</span>
                  {language.native.toLowerCase() !== language.name.toLowerCase() ? (
                    <span className="block truncate text-[13px] text-muted-foreground">{language.native}</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  aria-pressed={isSpoken}
                  onClick={() => toggleSpeak(language.code)}
                  className={cn(CHIP_BASE, isSpoken ? CHIP_ON : CHIP_OFF)}
                >
                  I speak
                </button>
                <button
                  type="button"
                  aria-pressed={isLearning}
                  onClick={() => toggleLearn(language.code)}
                  className={cn(CHIP_BASE, isLearning ? CHIP_ON : CHIP_OFF)}
                >
                  Learning
                </button>
              </li>
            )
          })}
          {shown.length === 0 ? <li className="px-4 py-6 text-center text-[14px] text-muted-foreground">No language matches that search.</li> : null}
        </ul>
      </div>

      {value.speak.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">How well you speak</p>
          <ul className="flex flex-col gap-2">
            {value.speak.map((item) => (
              <li key={item.code} className="flex items-center gap-2 rounded-2xl border border-border py-2 pr-2 pl-4">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{nameOf(item.code)}</span>
                <label htmlFor={`level-${item.code}`} className="sr-only">
                  How well you speak {nameOf(item.code)}
                </label>
                <select
                  id={`level-${item.code}`}
                  value={item.level}
                  onChange={(event) => setLevel(item.code, event.target.value as SpeakLevel)}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-[14px]"
                >
                  {SPEAK_LEVELS.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => toggleSpeak(item.code)}
                  aria-label={`Remove ${nameOf(item.code)}`}
                  className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {value.learn.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Learning</p>
          <ul className="flex flex-wrap gap-2">
            {value.learn.map((code) => (
              <li key={code} className="inline-flex h-9 items-center gap-1 rounded-full border border-border pr-1 pl-3.5 text-[14px] font-medium">
                {nameOf(code)}
                <button
                  type="button"
                  onClick={() => toggleLearn(code)}
                  aria-label={`Stop learning ${nameOf(code)}`}
                  className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
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
        hint="Shown to people you could practise with, when they turn this on too."
      />
    </div>
  )
}
