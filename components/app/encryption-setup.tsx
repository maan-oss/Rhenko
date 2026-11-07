import { CheckCheck, Lock } from "lucide-react"
import styles from "./encryption-setup.module.css"

// Shown while this browser makes its encryption keys the first time. It is a short chat in the style of a messaging app, with the
// same end-to-end line such apps show: a message arrives, the other side is typing, and the reply goes out and is read. Nothing here
// waits on the network. The words say what is happening, and `slow` adds a line once the wait gets long.
export function EncryptionSetup({ slow }: { slow: boolean }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-5 text-center">
      <span className="sr-only">Setting up encryption on this browser</span>

      <div aria-hidden="true" className="flex w-full max-w-[272px] flex-col gap-2 rounded-2xl bg-muted/60 px-3 pt-3 pb-4">
        <p className="flex items-center justify-center gap-1.5 text-[11px] leading-none text-muted-foreground">
          <Lock className="size-3" strokeWidth={2.25} />
          Messages are end-to-end encrypted
        </p>

        <div className="mt-1 flex flex-col gap-2">
          <div className={`${styles.incoming} max-w-[84%] self-start rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 text-left text-[13px] leading-snug text-foreground`}>
            Making your keys on this device.
          </div>

          <div className={`${styles.typing} flex items-center gap-1 self-start rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2.5`}>
            <span className={`${styles.dot} size-1.5 rounded-full bg-muted-foreground`} />
            <span className={`${styles.dot} ${styles.dotTwo} size-1.5 rounded-full bg-muted-foreground`} />
            <span className={`${styles.dot} ${styles.dotThree} size-1.5 rounded-full bg-muted-foreground`} />
          </div>

          <div className={`${styles.outgoing} flex max-w-[84%] items-end gap-1.5 self-end rounded-2xl rounded-tr-sm bg-foreground px-3 py-2 text-left text-[13px] leading-snug text-background`}>
            <span>Done. Only this browser holds the private keys.</span>
            <CheckCheck className={`${styles.tick} mb-px size-3.5 shrink-0`} strokeWidth={2.25} />
          </div>
        </div>
      </div>

      <p className="text-[15px] font-medium text-foreground">Setting up encryption on this browser</p>
      <p className="max-w-[30ch] text-[14px] leading-relaxed text-muted-foreground">
        Your keys are made here. The private keys stay in this browser.
      </p>
      {slow ? (
        <p className="text-[13px] text-muted-foreground">Still working. If this takes long, check your connection.</p>
      ) : null}
    </div>
  )
}
