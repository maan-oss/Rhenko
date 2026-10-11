import { EventEmitter } from "node:events"

// In-process event bus. Server actions publish here and the /api/events
// stream forwards events to each user's open tabs. Single-server only: an app
// running on several instances would need a shared broker.
type Globals = { __rhenkoBus?: EventEmitter }
const globals = globalThis as unknown as Globals

const bus: EventEmitter = globals.__rhenkoBus ?? new EventEmitter()
bus.setMaxListeners(0)
globals.__rhenkoBus = bus

export type RealtimeEvent =
  | { type: "notification" }
  | { type: "message"; conversationId: string }
  | { type: "typing"; conversationId: string; name: string }

export function publish(userIds: string[], event: RealtimeEvent): void {
  for (const id of new Set(userIds)) bus.emit(`user:${id}`, event)
}

export function subscribe(userId: string, listener: (event: RealtimeEvent) => void): () => void {
  const key = `user:${userId}`
  bus.on(key, listener)
  return () => bus.off(key, listener)
}
