import type { IceServerConfig } from "@/lib/bus"

// The servers browsers use to find a route between two people. RHENKO_ICE_SERVERS takes a JSON array of your own
// STUN or TURN servers. Without it the public STUN server is used, which connects most home networks but not every
// strict NAT; a TURN server closes that gap.
const DEFAULT_SERVERS: IceServerConfig[] = [{ urls: "stun:stun.l.google.com:19302" }]

export function iceServers(): IceServerConfig[] {
  const raw = process.env.RHENKO_ICE_SERVERS
  if (!raw) return DEFAULT_SERVERS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as IceServerConfig[]
  } catch {
    // Not valid JSON: fall back to the default rather than failing every call.
  }
  return DEFAULT_SERVERS
}
