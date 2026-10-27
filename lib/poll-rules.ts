// Rules for a poll sent in a chat: what its question and choices may say, and which choices a person may vote for. Pure, with no
// imports, so the composer, the server and the unit tests read the same numbers.

export const POLL_QUESTION_MAX = 255
export const POLL_CHOICE_MAX = 100
export const POLL_CHOICES_MIN = 2
export const POLL_CHOICES_MAX = 12
const CHOICE_ID_MAX = 40

export type PollOptionSpec = { id: string; label: string }

// Text a reader sees: control characters become spaces, runs of spaces collapse, and the ends are trimmed.
export function cleanPollText(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
}

function length(text: string): number {
  return [...text].length
}

// A poll the composer sent: its question, its choices with blank ones dropped, and whether more than one may be chosen.
// Anything the composer would not accept is refused with the reason, so a hand-made request cannot get past it.
export function pollInput(raw: unknown): { ok: true; question: string; choices: string[]; multiple: boolean } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "That poll isn't valid. Make it again." }
  const value = raw as Record<string, unknown>
  if (typeof value.question !== "string" || !Array.isArray(value.choices) || typeof value.multiple !== "boolean") {
    return { ok: false, error: "That poll isn't valid. Make it again." }
  }
  const question = cleanPollText(value.question)
  if (!question) return { ok: false, error: "Add a question for the poll." }
  if (length(question) > POLL_QUESTION_MAX) return { ok: false, error: `Poll questions can have up to ${POLL_QUESTION_MAX} characters.` }
  if (value.choices.length > POLL_CHOICES_MAX * 2) return { ok: false, error: `A poll can have up to ${POLL_CHOICES_MAX} choices.` }
  const choices: string[] = []
  for (const item of value.choices) {
    if (typeof item !== "string") return { ok: false, error: "That poll isn't valid. Make it again." }
    const choice = cleanPollText(item)
    if (!choice) continue
    if (length(choice) > POLL_CHOICE_MAX) return { ok: false, error: `Poll choices can have up to ${POLL_CHOICE_MAX} characters.` }
    choices.push(choice)
  }
  if (choices.length < POLL_CHOICES_MIN) return { ok: false, error: `A poll needs at least ${POLL_CHOICES_MIN} choices.` }
  if (choices.length > POLL_CHOICES_MAX) return { ok: false, error: `A poll can have up to ${POLL_CHOICES_MAX} choices.` }
  if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) {
    return { ok: false, error: "Each choice needs its own text." }
  }
  return { ok: true, question, choices, multiple: value.multiple }
}

// The stored poll's options and answer type, read back from the attachment. Null for anything that is not a well-formed poll.
export function parsePollAttachment(value: Record<string, unknown>): { question: string; options: PollOptionSpec[]; multiple: boolean } | null {
  if (typeof value.question !== "string" || typeof value.multiple !== "boolean" || !Array.isArray(value.options)) return null
  const question = cleanPollText(value.question)
  if (!question || length(question) > POLL_QUESTION_MAX) return null
  if (value.options.length < POLL_CHOICES_MIN || value.options.length > POLL_CHOICES_MAX) return null
  const options: PollOptionSpec[] = []
  const ids = new Set<string>()
  for (const item of value.options) {
    if (!item || typeof item !== "object") return null
    const option = item as Record<string, unknown>
    if (typeof option.id !== "string" || option.id.length === 0 || option.id.length > CHOICE_ID_MAX || ids.has(option.id)) return null
    if (typeof option.label !== "string") return null
    const label = cleanPollText(option.label)
    if (!label || length(label) > POLL_CHOICE_MAX) return null
    ids.add(option.id)
    options.push({ id: option.id, label })
  }
  return { question, options, multiple: value.multiple }
}

// The choices a vote names: each one an option of this poll, no repeats, and one at most for a single-answer poll. An empty
// list takes the vote back.
export function pollVoteInput(
  raw: unknown,
  options: PollOptionSpec[],
  multiple: boolean
): { ok: true; choices: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) return { ok: false, error: "That choice doesn't exist." }
  const choices = raw as string[]
  const known = new Set(options.map((option) => option.id))
  if (choices.some((choice) => !known.has(choice))) return { ok: false, error: "That choice doesn't exist." }
  if (new Set(choices).size !== choices.length) return { ok: false, error: "That choice doesn't exist." }
  if (!multiple && choices.length > 1) return { ok: false, error: "Choose one answer." }
  return { ok: true, choices }
}
