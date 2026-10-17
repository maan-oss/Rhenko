"use server"

import { clientIp } from "@/lib/auth"
import { consume, waitLabel } from "@/lib/rate-limit"
import { formStamp, issueProof, type ProofSpec } from "@/lib/proof"

export type ProofResult = { ok: true; proof: ProofSpec } | { ok: false; error: string }

const HOUR = 60 * 60 * 1000

// The check for a form on the page. A network can ask for only so many, so a script cannot collect them in bulk.
export async function requestProof(): Promise<ProofResult> {
  const ip = await clientIp()
  const limit = await consume(`proof:${ip}`, 120, HOUR)
  if (!limit.ok) {
    return { ok: false, error: `Too many checks were asked for from this network. Try again in ${waitLabel(limit.retryAfterSeconds)}.` }
  }
  return { ok: true, proof: await issueProof(ip) }
}

// The time a form was shown, signed by the server. A form sent sooner than a person could fill it in is refused.
export async function requestStamp(): Promise<string> {
  return formStamp()
}
