import { PageHeader } from "@/components/app/page-header"
import { ThemeChoice } from "@/components/app/theme-choice"

// Light or dark. The choice sweeps across the screen, then stays for the next visit.
export default function AppearanceSettingsPage() {
  return (
    <>
      <PageHeader title="Appearance" backHref="/settings" />
      <section className="px-4 py-4">
        <ThemeChoice />
      </section>
    </>
  )
}
