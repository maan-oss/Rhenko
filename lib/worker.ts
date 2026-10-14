import { randomUUID } from "node:crypto"

// Identifies this server process in the shared database: the event streams it holds open and the lease it may take.
// A process keeps one id for its whole life. A restarted process gets a new one.
type Globals = { __rhenkoWorker?: string }
const globals = globalThis as unknown as Globals

export const WORKER_ID: string = (globals.__rhenkoWorker ??= `${process.pid}-${randomUUID()}`)
