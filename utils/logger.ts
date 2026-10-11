export const logger = {
  log: (...args: unknown[]) => console.log('[🫗LOGGER]', ...args),
  warn: (...args: unknown[]) => console.warn('[⚠️ LOGGER]', ...args),
  error: (...args: unknown[]) => console.error('[❌LOGGER]', ...args),
  info: (...args: unknown[]) => console.info('[ℹ️ LOGGER]', ...args),
  trace: (...args: unknown[]) => console.trace('[🔎 LOGGER]', ...args),
  debug: (...args: unknown[]) => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.debug('[🪲LOGGER]', ...args)
    }
  },
}
