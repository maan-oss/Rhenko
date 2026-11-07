// What a copyright notice and a counter-notice must say, under 17 U.S.C. 512(c)(3)(A) and 512(g)(3). Each check returns the message to
// show, or null when the fields are good enough. Pure, with no imports, so the forms, the actions and the tests share one set of rules.

export type CopyrightNoticeFields = {
  kind: string
  work: string
  url: string
  address: string
  phone: string
  authorized: boolean
}

export type CounterNoticeFields = {
  name: string
  address: string
  phone: string
  signature: string
  mistake: boolean
  consent: boolean
}

// A telephone number: digits with the usual spaces and punctuation, at least six digits, and no more than thirty characters.
export function validPhone(value: string): boolean {
  if (value.length > 30 || !/^\+?[\d\s().-]+$/.test(value)) return false
  return (value.match(/\d/g) ?? []).length >= 6
}

// A copyright notice must identify the work, the material and where it is, give a postal address and a telephone number for the
// owner or their agent, and state under penalty of perjury that the sender is authorised to act for the owner.
export function copyrightNoticeProblem(fields: CopyrightNoticeFields): string | null {
  if (fields.kind !== "copyright") return null
  if ([...fields.work].length < 3) return "Name the work you own that is being copied."
  if (fields.url === "") return "Give the link to the copied material, so it can be found."
  if ([...fields.address].length < 5) return "Give a postal address for the owner or their agent."
  if (!validPhone(fields.phone)) return "Give a telephone number we can call, with at least six digits."
  if (!fields.authorized) return "Confirm, under penalty of perjury, that you are authorised to act for the owner."
  return null
}

// A counter-notice from the person whose post was removed must give their signature, name, postal address and telephone number, state
// under penalty of perjury that the material was removed by mistake or misidentification, and consent to the jurisdiction of the
// federal court where their address is, and to accept service.
export function counterNoticeProblem(fields: CounterNoticeFields): string | null {
  if ([...fields.name].length < 2 || [...fields.name].length > 100) return "Give your full name, between 2 and 100 characters."
  if ([...fields.address].length < 5 || [...fields.address].length > 300) return "Give your postal address, between 5 and 300 characters."
  if (!validPhone(fields.phone)) return "Give a telephone number, with at least six digits."
  if ([...fields.signature].length < 2 || [...fields.signature].length > 100) return "Type your full name as your signature."
  if (!fields.mistake) {
    return "Confirm, under penalty of perjury, that you believe the material was removed by mistake or misidentification."
  }
  if (!fields.consent) {
    return "Consent to the jurisdiction of the federal court for your address, and to accept service from the person who sent the notice."
  }
  return null
}
