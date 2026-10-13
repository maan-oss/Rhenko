// The languages people can list, and a guess at the language a post or message is written in.
//
// The guess is a heuristic, not a language identifier. It looks at the writing system first (Arabic script, Devanagari,
// kana and so on), then at common short words and a few marks that only one language uses. It answers only when one
// language is clearly ahead, and says nothing ("null") for short or mixed text. A wrong or missing answer costs the
// reader a translate button, never a post. Pure functions only, so the browser and the server share them.

export type Language = { code: string; name: string; native: string }

// ISO 639-1 codes. Names are in English, with the language's own name beside them.
export const LANGUAGES: readonly Language[] = [
  { code: "en", name: "English", native: "English" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "tl", name: "Filipino", native: "Filipino" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "zu", name: "Zulu", native: "isiZulu" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "ka", name: "Georgian", native: "ქართული" },
  { code: "hy", name: "Armenian", native: "Հայերեն" },
]

const BY_CODE: ReadonlyMap<string, Language> = new Map(LANGUAGES.map((language) => [language.code, language] as const))

export function isLanguageCode(code: string): boolean {
  return BY_CODE.has(code)
}

// The English name of a language, or null for a code this list does not have.
export function languageName(code: string): string | null {
  return BY_CODE.get(code)?.name ?? null
}

// How well someone speaks a language they speak. Learning is a separate list, with no level.
export const SPEAK_LEVELS = [
  { id: "native", label: "Native" },
  { id: "fluent", label: "Fluent" },
  { id: "conversational", label: "Conversational" },
] as const

export type SpeakLevel = (typeof SPEAK_LEVELS)[number]["id"]

export function isSpeakLevel(value: string): value is SpeakLevel {
  return SPEAK_LEVELS.some((level) => level.id === value)
}

// Most languages written in a non-Latin script, by the script they use. The first script found in the text decides.
const SCRIPTS: readonly { code: string; pattern: RegExp }[] = [
  { code: "ar", pattern: /\p{Script=Arabic}/gu },
  { code: "hi", pattern: /\p{Script=Devanagari}/gu },
  { code: "bn", pattern: /\p{Script=Bengali}/gu },
  { code: "pa", pattern: /\p{Script=Gurmukhi}/gu },
  { code: "gu", pattern: /\p{Script=Gujarati}/gu },
  { code: "ta", pattern: /\p{Script=Tamil}/gu },
  { code: "te", pattern: /\p{Script=Telugu}/gu },
  { code: "kn", pattern: /\p{Script=Kannada}/gu },
  { code: "ml", pattern: /\p{Script=Malayalam}/gu },
  { code: "th", pattern: /\p{Script=Thai}/gu },
  { code: "ko", pattern: /\p{Script=Hangul}/gu },
  { code: "ja", pattern: /[\p{Script=Hiragana}\p{Script=Katakana}]/gu },
  { code: "zh", pattern: /\p{Script=Han}/gu },
  { code: "el", pattern: /\p{Script=Greek}/gu },
  { code: "he", pattern: /\p{Script=Hebrew}/gu },
  { code: "ka", pattern: /\p{Script=Georgian}/gu },
  { code: "hy", pattern: /\p{Script=Armenian}/gu },
  { code: "am", pattern: /\p{Script=Ethiopic}/gu },
  { code: "ru", pattern: /\p{Script=Cyrillic}/gu },
]

const LATIN = /\p{Script=Latin}/gu

// Short words that only a few languages use often. Written without accents, the way the text is compared.
const WORDS: Readonly<Record<string, string>> = {
  en: "the and is are you that with this for not was have they what your just but from will can there their about would should when where which who how why because i think",
  es: "de la que el en los las por con para una es pero como muy mas gracias hola esta estoy y un se no lo al del bien",
  fr: "le les des et est une pour dans pas je vous avec sur qui mais tres merci bonjour nous ca du au aux ce cette ne c",
  de: "der die und ist nicht ich das mit ein eine zu auf auch wir sie danke bitte aber dem den dass hallo",
  it: "il che di non per sono anche ciao grazie della questo come una mi sei siamo molto perche",
  pt: "nao uma para com voce mas obrigado obrigada muito sao isso esta eu ele tambem ola dos das pelo pela bem",
  nl: "het een van ik dat niet zijn met voor je ook maar bedankt hallo wat deze dit er wel hij zij we",
  sv: "och att det som ar for med inte jag pa har tack hej men detta vi du han hon",
  da: "og er det at til jeg ikke med af tak hej men vi du han hun",
  fi: "ja on ei etta se oli han mina kiitos hei mutta kanssa tama olen ovat",
  pl: "nie ze sie na jest to jak ale dla tak dziekuje czesc czy ktory ja ty on ona",
  ro: "si este ca nu pentru sunt din cu mai dar multumesc buna care sa era fi ai",
  tr: "ve bir bu icin ile cok ama degil ben sen merhaba tesekkur da de ne var yok",
  id: "dan yang di ini itu untuk dengan tidak saya kamu aku ada akan bisa terima kasih apa",
  tl: "ang ng mga sa na ako ikaw hindi po salamat kumusta ito naman lang ko nila",
  vi: "va cua khong la co nhung duoc cho nay nguoi toi ban cam on xin chao voi",
  sw: "na ya wa kwa ni katika sana asante habari mimi wewe hapana kama hii hiyo",
}

// Marks that belong to one language. A mark counts for more than a word, because common words are shared.
const MARKS: readonly { code: string; pattern: RegExp; weight: number }[] = [
  { code: "es", pattern: /[ñ¿¡]/g, weight: 3 },
  { code: "pt", pattern: /[ãõ]/g, weight: 2 },
  { code: "de", pattern: /ß/g, weight: 2 },
  { code: "tr", pattern: /[ğşıİ]/g, weight: 2 },
  { code: "ro", pattern: /[ăâîșț]/g, weight: 2 },
  { code: "pl", pattern: /[ąęłżźń]/g, weight: 2 },
  // Vietnamese tone marks. Other Latin languages do not use these combinations.
  { code: "vi", pattern: /[đạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/g, weight: 3 },
]

// A text with fewer letters than this is too short to judge, so it gets no language.
const MIN_LETTERS = 12

// A Latin-script language is named only when it scores at least this many hits and at least this share of the words.
const MIN_HITS = 2
const MIN_SHARE = 0.15

// Kana appear in Japanese and nowhere else, so one kana beats a mostly-kanji sentence that Chinese would also use.
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/gu

const WORD_SETS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.entries(WORDS).map(([code, list]) => [code, new Set(list.split(" "))] as const)
)

// Links, mentions, hashtags and cashtags say nothing about the language of the words around them.
function prose(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, " ").replace(/[@#$][\p{L}\p{N}_]+/gu, " ")
}

function countOf(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

// The language written in a text, as an ISO 639-1 code, or null when it is too short or too mixed to say.
export function detectLanguage(text: string): string | null {
  const body = prose(text)
  const letters = countOf(body, /\p{L}/gu)
  if (letters < MIN_LETTERS) return null

  // The writing system first. A text mostly in one non-Latin script is that script's language.
  const latin = countOf(body, LATIN)
  let script: { code: string; count: number } | null = null
  for (const candidate of SCRIPTS) {
    const count = countOf(body, candidate.pattern)
    if (count > 0 && (script === null || count > script.count)) script = { code: candidate.code, count }
  }
  if (script !== null && script.count >= 3 && script.count >= latin) {
    if ((script.code === "zh" || script.code === "ja") && countOf(body, KANA) > 0) return "ja"
    return refineScript(script.code, body)
  }

  // Latin script: common words and marks, with the best language clearly ahead of the next.
  const normal = body.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase()
  const tokens = normal.match(/\p{L}+/gu) ?? []
  if (tokens.length === 0) return null
  const scores = new Map<string, number>()
  for (const [code, words] of WORD_SETS) {
    let hits = 0
    for (const token of tokens) if (words.has(token)) hits++
    scores.set(code, hits)
  }
  for (const mark of MARKS) {
    const found = countOf(body, mark.pattern)
    if (found > 0) scores.set(mark.code, (scores.get(mark.code) ?? 0) + found * mark.weight)
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  const [best, second] = ranked
  if (!best || best[1] < MIN_HITS || best[1] < MIN_SHARE * tokens.length) return null
  if (second && second[1] === best[1]) return null
  return best[0]
}

// Several languages share a script. These marks pick between them.
function refineScript(code: string, body: string): string {
  if (code === "ja") return "ja"
  if (code === "zh") return "zh"
  // Urdu has letters Persian and Arabic do not (the retroflex letters, and ں, ے, ہ). Persian has letters Arabic does not.
  // Urdu also uses the Persian letters, so the Urdu test goes first.
  if (code === "ar") {
    if (/[ٹڈڑںےہھ]/u.test(body)) return "ur"
    if (/[پچژگ]/u.test(body)) return "fa"
    return "ar"
  }
  if (code === "ru" && /[іїєґ]/iu.test(body)) return "uk"
  return code
}

// The language stored with a post or message: its guess, or "" when the guess is unsure. An empty value is never shown
// as a language and is never translated without asking the reader first.
export function languageOf(text: string): string {
  return detectLanguage(text) ?? ""
}
