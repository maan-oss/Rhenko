// Badges that come from an account's own record: OG, Veteran, and the ID-checked mark a person chooses to show. The paid ring
// and the verified check are set elsewhere (lib/payments.ts and the operator). Nothing here reads a payment or an ID check.
// Pure on purpose: no imports, so the unit checks can load it directly.

// The first accounts on Rhenko are OG. This is an operator decision: change it here and in docs/lawyer-review.md together.
export const OG_LIMIT = 1000

// An account at least this many days old is a Veteran.
export const VETERAN_DAYS = 365

export type AccountMarks = {
  // One of the first OG_LIMIT accounts.
  og: boolean
  // The account is at least VETERAN_DAYS old.
  veteran: boolean
  // The person passed the Stripe ID check and chose to show it. Rhenko keeps the result, not the ID.
  idChecked: boolean
}

// The columns a query adds to select the marks of an account selected as `u`. accountMarks reads them.
export const MARK_COLUMNS = `u.og_badge AS mark_og, u.created_at AS mark_created_at,
  CASE WHEN u.show_id_badge = 1 AND u.age_check = 'adult' THEN 1 ELSE 0 END AS mark_id_checked`

export type MarkRow = { mark_og: number; mark_created_at: number; mark_id_checked: number }

export function accountMarks(row: MarkRow, now: number = Date.now()): AccountMarks {
  return {
    og: row.mark_og === 1,
    veteran: now - row.mark_created_at >= VETERAN_DAYS * 24 * 60 * 60 * 1000,
    idChecked: row.mark_id_checked === 1,
  }
}
