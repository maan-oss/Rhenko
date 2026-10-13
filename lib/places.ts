// Where someone is, for suggestions. The app keeps a country and a city or town, never a street address, a postcode or a
// position from a device. Pure functions only, so the browser and the server share them.

// The countries people can choose, with their English names. The names are written out here rather than looked up while the
// page runs: the browser and the server ship different region data, and a name that differs between them makes the page fail
// to load. The codes are ISO 3166-1 alpha-2.
const COUNTRY_NAMES = {
  AE: "United Arab Emirates",
  AF: "Afghanistan",
  AL: "Albania",
  AR: "Argentina",
  AT: "Austria",
  AU: "Australia",
  BD: "Bangladesh",
  BE: "Belgium",
  BG: "Bulgaria",
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CN: "China",
  CO: "Colombia",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  DZ: "Algeria",
  EG: "Egypt",
  ES: "Spain",
  ET: "Ethiopia",
  FI: "Finland",
  FR: "France",
  GB: "United Kingdom",
  GH: "Ghana",
  GR: "Greece",
  HK: "Hong Kong",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IN: "India",
  IQ: "Iraq",
  IR: "Iran",
  IT: "Italy",
  JP: "Japan",
  KE: "Kenya",
  KH: "Cambodia",
  KR: "South Korea",
  LK: "Sri Lanka",
  MA: "Morocco",
  MM: "Myanmar (Burma)",
  MX: "Mexico",
  MY: "Malaysia",
  NG: "Nigeria",
  NL: "Netherlands",
  NO: "Norway",
  NP: "Nepal",
  NZ: "New Zealand",
  PE: "Peru",
  PH: "Philippines",
  PK: "Pakistan",
  PL: "Poland",
  PT: "Portugal",
  QA: "Qatar",
  RO: "Romania",
  RU: "Russia",
  SA: "Saudi Arabia",
  SE: "Sweden",
  SG: "Singapore",
  TH: "Thailand",
  TN: "Tunisia",
  TR: "Türkiye",
  TW: "Taiwan",
  TZ: "Tanzania",
  UA: "Ukraine",
  UG: "Uganda",
  US: "United States",
  VE: "Venezuela",
  VN: "Vietnam",
  ZA: "South Africa",
} as const

export type Country = { code: string; name: string }

export const COUNTRIES: readonly Country[] = Object.entries(COUNTRY_NAMES)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

const COUNTRY_SET: ReadonlySet<string> = new Set(Object.keys(COUNTRY_NAMES))

export function isCountryCode(code: string): boolean {
  return COUNTRY_SET.has(code)
}

export function countryName(code: string): string | null {
  return COUNTRY_SET.has(code) ? COUNTRY_NAMES[code as keyof typeof COUNTRY_NAMES] : null
}

export const AREA_MAX = 40

// Words that mark a street address. A city or town never needs them.
const STREET_WORDS = /\b(street|road|avenue|lane|drive|crescent|boulevard|highway|apartment|apt|suite|unit|flat)\b/i

// The first problem with a city or town as typed, or null when it is fine. An empty value is fine: it clears the area.
export function areaProblem(area: string): string | null {
  const text = area.trim().replace(/\s+/g, " ")
  if (text === "") return null
  if ([...text].length > AREA_MAX) return `Up to ${AREA_MAX} characters.`
  if (!/\p{L}/u.test(text)) return "Use the name of your city or town."
  if (/\d/.test(text)) return "Use your city or town only. Leave out house numbers and postcodes."
  if (STREET_WORDS.test(text)) return "Use your city or town, not a street address."
  return null
}

// The area as it is shown: spaces tidied, the case kept as the person typed it.
export function cleanArea(area: string): string {
  return area.trim().replace(/\s+/g, " ")
}

// The comparison form of an area, so "Brisbane", "brisbane " and "Brisbane" are the same place. Accents are dropped
// and punctuation becomes a space, so "Saint-Denis" and "Saint Denis" match too.
export function areaKey(area: string): string {
  return area
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}
