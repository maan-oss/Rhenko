export function SectionHeader({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string
  eyebrow: string
  title: string
  description?: string
}) {
  return (
    <header id={id} className="flex scroll-mt-20 flex-col gap-2 border-b border-border pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="text-2xl font-semibold text-balance">{title}</h2>
      {description ? (
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">{description}</p>
      ) : null}
    </header>
  )
}
