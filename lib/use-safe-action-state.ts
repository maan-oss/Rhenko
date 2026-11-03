import { useActionState } from "react"

const DEFAULT_MESSAGE = "That didn't go through. Check your connection and try again."

// A form's action that cannot throw. When its request never reaches the server, or the server fails, the form gets an error to
// show where its message goes. Thrown instead, it reaches the page's error screen and the form is lost. Next's own signals
// (redirects, not-found) are passed through, since they are not failures. `failure` builds the error state for a state shape
// other than { error }.
export function useSafeActionState<S>(
  action: (previous: S, payload: FormData) => S | Promise<S>,
  initial: S,
  message = DEFAULT_MESSAGE,
  failure: (text: string) => S = (text) => ({ error: text }) as S
) {
  return useActionState<S, FormData>(async (previous, payload) => {
    try {
      return await action(previous as S, payload)
    } catch (error) {
      if (isNextSignal(error)) throw error
      return failure(message)
    }
  }, initial as Awaited<S>)
}

function isNextSignal(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false
  const digest = (error as { digest: unknown }).digest
  return typeof digest === "string" && digest.startsWith("NEXT_")
}
