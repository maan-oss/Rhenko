// Every number on the analytics pages is written out in full, exactly as the data layer counted it.

const EXACT = new Intl.NumberFormat("en-US")

export function exact(value: number): string {
  return EXACT.format(value)
}
