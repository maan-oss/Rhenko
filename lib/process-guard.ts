// Node ends the whole process on a promise that nobody handled. Background work can fail that way, so the failure is
// logged here and everyone else keeps being served. Installed once per process, even when the hook runs again.
export function keepServingOnRejections(): void {
  const guard = globalThis as unknown as { __rhenkoRejections?: boolean }
  if (guard.__rhenkoRejections) return
  guard.__rhenkoRejections = true
  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandled promise rejection", reason)
  })
}
