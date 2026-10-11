import { createHmac } from "node:crypto"
import type { IceServerConfig } from "@/lib/bus"

// The servers browsers use to find a route between two people.
//
// RHENKO_ICE_SERVERS takes a JSON array of your own STUN or TURN servers, each { "urls": ..., "username"?,
// "credential"? }. Without it, or when it is malformed, the public STUN server is used. That connects most home
// networks but not every strict NAT; a TURN server closes the gap.
//
// RHENKO_TURN_SECRET turns on short-lived TURN credentials (the TURN REST scheme, coturn's use-auth-secret):
// the username is "<expiry seconds>:<user id>" and the credential is the base64 HMAC-SHA1 of the username under the
// secret. RHENKO_TURN_URLS lists the turn: and turns: URLs, separated by commas. Credentials are made for one person
// for one call and last 12 hours, so one person's never reach another.

const STUN_FALLBACK: IceServerConfig[] = [{ urls: "stun:stun.l.google.com:19302" }]
const TURN_TTL_SECONDS = 12 * 60 * 60
const ICE_URL = /^(stuns?|turns?):\S+$/i
const TURN_URL = /^turns?:\S+$/i

const warned = new Set<string>()
let parsedFrom: string | null = null
let parsed: IceServerConfig[] = STUN_FALLBACK

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}

// One entry of RHENKO_ICE_SERVERS, or null when it is not a usable server. A TURN URL needs its username and
// credential, or the browser refuses the whole list.
function serverFrom(value: unknown): IceServerConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const { urls, username, credential } = value as Record<string, unknown>
  const list = typeof urls === "string" ? [urls] : Array.isArray(urls) ? urls : null
  if (!list || list.length === 0) return null
  if (!list.every((url): url is string => typeof url === "string" && ICE_URL.test(url.trim()))) return null
  if (username !== undefined && typeof username !== "string") return null
  if (credential !== undefined && typeof credential !== "string") return null
  const needsLogin = list.some((url) => TURN_URL.test(url.trim()))
  if (needsLogin && (!username || !credential)) return null
  const server: IceServerConfig = { urls: list.map((url) => url.trim()) }
  if (typeof username === "string") server.username = username
  if (typeof credential === "string") server.credential = credential
  return server
}

function configuredServers(): IceServerConfig[] {
  const raw = process.env.RHENKO_ICE_SERVERS?.trim() ?? ""
  if (!raw) return STUN_FALLBACK
  if (raw === parsedFrom) return parsed
  parsedFrom = raw
  parsed = STUN_FALLBACK
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    warnOnce(`ice:${raw}`, "[calls] RHENKO_ICE_SERVERS is not valid JSON, so calls use the public STUN server.")
    return parsed
  }
  const servers = Array.isArray(value) ? value.map(serverFrom) : []
  if (servers.length === 0 || servers.some((server) => server === null)) {
    warnOnce(
      `ice:${raw}`,
      '[calls] RHENKO_ICE_SERVERS must be a JSON array of { "urls", "username"?, "credential"? } with stun:, stuns:, turn: or turns: URLs, and every TURN server needs a username and credential. Calls use the public STUN server until it is fixed.'
    )
    return parsed
  }
  parsed = servers as IceServerConfig[]
  return parsed
}

// A TURN server login for one person, valid for 12 hours, when RHENKO_TURN_SECRET is set.
function turnFor(userId: string, now: number): IceServerConfig | null {
  const secret = process.env.RHENKO_TURN_SECRET
  if (!secret) return null
  const urls = (process.env.RHENKO_TURN_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
  if (urls.length === 0 || !urls.every((url) => TURN_URL.test(url))) {
    warnOnce("turn-urls", "[calls] RHENKO_TURN_SECRET is set, but RHENKO_TURN_URLS has no valid turn: or turns: URLs, so calls run without TURN.")
    return null
  }
  const username = `${Math.floor(now / 1000) + TURN_TTL_SECONDS}:${userId}`
  const credential = createHmac("sha1", secret).update(username).digest("base64")
  return { urls, username, credential }
}

// The servers one person uses for one call.
export function iceServersFor(userId: string, now = Date.now()): IceServerConfig[] {
  const servers = configuredServers().map((server) => ({ ...server, urls: Array.isArray(server.urls) ? [...server.urls] : server.urls }))
  const turn = turnFor(userId, now)
  if (turn) servers.push(turn)
  return servers
}
