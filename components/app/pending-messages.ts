import { useSyncExternalStore } from "react"

// Messages a person has just sent that the server has not yet shown back in the thread. The composer adds one the moment
// Send is pressed, so the text appears at once; the thread drops it when the saved message arrives, and the composer drops
// it if the send fails (the text stays in the box, with the error).

export type PendingMessage = { key: string; body: string; createdAt: number }

const EMPTY: PendingMessage[] = []
const byConversation = new Map<string, PendingMessage[]>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function addPending(conversationId: string, message: PendingMessage): void {
  byConversation.set(conversationId, [...(byConversation.get(conversationId) ?? []), message])
  emit()
}

export function removePending(conversationId: string, key: string): void {
  const current = byConversation.get(conversationId)
  if (!current?.some((message) => message.key === key)) return
  const next = current.filter((message) => message.key !== key)
  if (next.length === 0) byConversation.delete(conversationId)
  else byConversation.set(conversationId, next)
  emit()
}

// The messages still waiting in this conversation. The same array is returned until something changes, as the store needs.
export function usePending(conversationId: string): PendingMessage[] {
  return useSyncExternalStore(
    subscribe,
    () => byConversation.get(conversationId) ?? EMPTY,
    () => EMPTY
  )
}
