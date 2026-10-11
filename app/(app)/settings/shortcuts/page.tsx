import { PageHeader } from "@/components/app/page-header"
import { SHORTCUTS } from "@/lib/shortcuts"

export default function ShortcutsSettingsPage() {
  return (
    <>
      <PageHeader title="Keyboard shortcuts" backHref="/settings" />
      <section className="px-4 py-6">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[15px]">
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
