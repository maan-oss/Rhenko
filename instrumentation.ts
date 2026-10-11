// Runs once when the Node server starts. It starts the background work in lib/maintenance.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { startMaintenance } = await import("@/lib/maintenance")
  startMaintenance()
}
