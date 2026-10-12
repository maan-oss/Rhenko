// Money in the app. Amounts are whole minor units (cents), the way Stripe counts them. This assumes a currency with two
// decimal places, which covers the currencies the app is set up for. Client-safe.

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 2 }).format(minor / 100)
}
