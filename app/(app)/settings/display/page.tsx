import { PageHeader } from "@/components/app/page-header"
import { FontSizeChoice } from "@/components/app/font-size-choice"
import { ThemeChoice } from "@/components/app/theme-choice"
import { ReduceMotionChoice } from "@/components/app/motion-preference"
import { SHORTCUTS } from "@/lib/shortcuts"

export default function DisplaySettingsPage() {
  return (
    <>
      <PageHeader title="Display" backHref="/settings" />
      <section className="flex flex-col gap-3 border-b border-border px-4 py-6">
        <h2 className="text-lg font-semibold">Theme</h2>
        <p className="text-sm text-muted-foreground">Follow your device, or pick light or dark.</p>
        <ThemeChoice />
      </section>
      <section className="flex flex-col gap-3 border-b border-border px-4 py-6">
        <h2 className="text-lg font-semibold">Text size</h2>
        <p className="text-sm text-muted-foreground">Saved on this device.</p>
        <FontSizeChoice />
      </section>
      <section className="flex flex-col gap-3 border-b border-border px-4 py-6">
        <h2 className="text-lg font-semibold">Motion</h2>
        <ReduceMotionChoice />
      </section>
      <section className="flex flex-col gap-3 px-4 py-6">
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <p className="text-sm text-muted-foreground">Shortcuts work anywhere except while you&apos;re typing.</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[15px]">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="contents">
              <dt>
                <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-sm">{shortcut.keys}</kbd>
              </dt>
              <dd className="text-muted-foreground">{shortcut.label}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
