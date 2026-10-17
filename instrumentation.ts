// Runs once when the Node server starts. It keeps the process up over stray promise failures, then starts the
// background work in lib/maintenance.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { keepServingOnRejections } = await import("@/lib/process-guard")
  keepServingOnRejections()
  const { startMaintenance } = await import("@/lib/maintenance")
  await startMaintenance()
}
