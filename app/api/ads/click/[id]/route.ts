import { get, run } from "@/lib/db"

// The button on an ad. It counts the click and sends the person to the advertiser's address. Nothing about the person is
// recorded: a click adds one to the campaign's total, and that is all.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params
  const row = await get<{ link_url: string }>(
    `SELECT c.link_url FROM ad_campaigns c JOIN ad_accounts a ON a.id = c.account_id
     WHERE c.id = ? AND c.status IN ('active', 'ended') AND a.status = 'active'`,
    id
  )
  if (!row) return new Response("This ad is not available.", { status: 404, headers: { "Cache-Control": "no-store" } })
  await run("UPDATE ad_campaigns SET clicks = clicks + 1 WHERE id = ?", id)
  return new Response(null, { status: 302, headers: { Location: row.link_url, "Cache-Control": "no-store" } })
}
