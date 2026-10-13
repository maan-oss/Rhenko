"use client"

// Shown only when the root layout itself fails, so it draws its own document and cannot use the app's stylesheet. It
// keeps the app's two colours and follows the system's light or dark setting.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <style>{`
          body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; background: #fafafa; color: #0a0a0a; }
          main { max-width: 420px; padding: 24px; }
          h1 { font-size: 22px; margin: 0 0 8px; }
          p { margin: 0 0 16px; color: #5f5f5f; }
          button { height: 40px; padding: 0 20px; border: 0; border-radius: 999px; background: #0a0a0a; color: #fafafa; font-weight: 600; cursor: pointer; }
          .ref { margin: 16px 0 0; font-size: 13px; }
          @media (prefers-color-scheme: dark) {
            body { background: #171717; color: #ececec; }
            p, .ref { color: #a8a8a8; }
            button { background: #ececec; color: #171717; }
          }
        `}</style>
      </head>
      <body>
        <main>
          <h1>Rhenko did not load.</h1>
          <p>Try again. If it keeps failing, wait a minute and reload.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
          {error.digest ? <p className="ref">Reference: {error.digest}</p> : null}
        </main>
      </body>
    </html>
  )
}
