// Pure rules for age assurance. lib/age-assurance.ts holds the Stripe side. This file imports nothing, so the unit checks
// in tests/age-rules.test.mjs can run it directly.

export type AgeCheck = "none" | "pending" | "adult" | "not_adult"

export type DateOfBirth = { year: number; month: number; day: number }

// True when someone born on `dob` is at least `minimum` years old on `on`. The birthday itself counts as the day they turn that age.
// A leap-day birthday turns the age on 1 March in a year with no 29 February.
export function isAtLeast(dob: DateOfBirth, minimum: number, on: Date): boolean {
  const today = { year: on.getUTCFullYear(), month: on.getUTCMonth() + 1, day: on.getUTCDate() }
  let years = today.year - dob.year
  if (today.month < dob.month || (today.month === dob.month && today.day < dob.day)) years -= 1
  return years >= minimum
}

// Null when the account may post, reply, quote, repost, message and upload media. Otherwise the line the person sees instead.
// Reading, liking and following are never gated.
export function ageGateMessage(check: AgeCheck): string | null {
  if (check === "adult") return null
  if (check === "pending") return "Your age check is still in progress. You can post and send messages once it is confirmed."
  if (check === "not_adult") return "Rhenko is for people 18 and over, so this account cannot post, reply or send messages. Reading and following stay open."
  return "Confirm your age to post, reply, send messages or upload media. Reading and following stay open."
}
