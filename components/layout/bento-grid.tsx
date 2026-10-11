import { cn } from "@/lib/utils"

export function BentoGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:auto-rows-[11rem]">
      {children}
    </div>
  )
}

export function BentoCell({
  className,
  title,
  description,
  children,
}: {
  className?: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "flex min-h-40 flex-col justify-between gap-4 border border-border bg-card p-5",
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}
