// Solves the puzzle the server gave out (lib/proof.ts): finds a nonce whose hash, with the salt, starts with the required
// number of zero bits. It runs in the browser, in small steps that yield to the page, so typing and scrolling stay smooth.
import { meetsDifficulty, puzzleInput } from "@/lib/proof-rules"

const YIELD_EVERY = 400

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

// Tries nonces 0, 1, 2, ... in base 36 until one meets the difficulty. Stops with an error when the signal is aborted.
export async function solvePuzzle(salt: string, bits: number, signal: AbortSignal): Promise<string> {
  const encoder = new TextEncoder()
  for (let counter = 0; ; counter++) {
    if (signal.aborted) throw new DOMException("The check was stopped.", "AbortError")
    const nonce = counter.toString(36)
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(puzzleInput(salt, nonce)))
    if (meetsDifficulty(hex(digest), bits)) return nonce
    if (counter % YIELD_EVERY === YIELD_EVERY - 1) await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
