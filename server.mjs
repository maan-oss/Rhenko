// Starts Rhenko as several worker processes on one port. The master process starts the workers, restarts any that stop, and
// stops them on SIGTERM. Each worker serves requests with Next.js. The processes share their state through the database
// (lib/bus.ts, lib/call-state.ts, lib/rate-limit.ts, lib/leases.ts), so any of them can serve any request.
//
//   npm run build && npm start                       the production server on PORT (default 3000)
//   RHENKO_WORKERS=2 npm start                       sets the number of worker processes (default: 4, or the number of CPUs if fewer)
import cluster from "node:cluster"
import { randomUUID } from "node:crypto"
import { createServer } from "node:http"
import os from "node:os"
import { fileURLToPath } from "node:url"

const PORT = Number(process.env.PORT) || 3000
const HOST = process.env.RHENKO_HOST || "0.0.0.0"
const APP_DIR = fileURLToPath(new URL(".", import.meta.url))
const CPUS = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length
const WORKERS = Math.min(Math.max(Number(process.env.RHENKO_WORKERS) || Math.min(4, CPUS), 1), 32)
// How long the workers have to finish their requests once asked to stop. Event streams are long-lived, so this is a limit.
const STOP_MS = 10_000

if (cluster.isPrimary) {
  // Every process of one run shares this id, so a browser can tell a restart from a dropped connection.
  process.env.RHENKO_BOOT_ID = process.env.RHENKO_BOOT_ID || randomUUID()
  let stopping = false

  const startWorker = () => cluster.fork()
  for (let i = 0; i < WORKERS; i++) startWorker()

  cluster.on("exit", (worker, code, signal) => {
    if (stopping) return
    console.error(`[server] worker ${worker.process.pid} stopped (${signal ?? `code ${code}`}), starting another`)
    // A short pause before the replacement, so a worker that fails at start does not spin.
    setTimeout(() => {
      if (!stopping) startWorker()
    }, 1000).unref()
  })

  const stop = (signal) => {
    if (stopping) return
    stopping = true
    console.log(`[server] ${signal} received, stopping`)
    const workers = Object.values(cluster.workers ?? {}).filter(Boolean)
    if (workers.length === 0) process.exit(0)
    let left = workers.length
    for (const worker of workers) {
      worker.once("exit", () => {
        left -= 1
        if (left === 0) process.exit(0)
      })
      worker.process.kill("SIGTERM")
    }
    setTimeout(() => process.exit(0), STOP_MS).unref()
  }
  process.on("SIGTERM", () => stop("SIGTERM"))
  process.on("SIGINT", () => stop("SIGINT"))

  console.log(`> Rhenko on http://${HOST}:${PORT} with ${WORKERS} worker process${WORKERS === 1 ? "" : "es"}`)
} else {
  const { default: next } = await import("next")
  // Next calls itself on this port for some redirects, so it has to be told the port this server answers on.
  const app = next({ dev: false, dir: APP_DIR, port: PORT, hostname: HOST === "0.0.0.0" ? "127.0.0.1" : HOST })
  const handle = app.getRequestHandler()
  // prepare() loads the build and runs instrumentation.ts, which starts the background work in this process.
  await app.prepare()

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error("[server] a request failed", error)
      if (!res.headersSent) res.statusCode = 500
      res.end()
    })
  })
  server.listen(PORT, HOST)

  const shutdown = () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}
