import Link from "next/link"

const columns = [
  {
    title: "Core",
    links: [
      { href: "#core", label: "Buttons and inputs" },
      { href: "#core", label: "Tabs and overlays" },
    ],
  },
  {
    title: "Motion",
    links: [
      { href: "#motion", label: "Text effects" },
      { href: "#motion", label: "Magnetic dock" },
    ],
  },
  {
    title: "Icons and loaders",
    links: [
      { href: "#icons", label: "Animated icons" },
      { href: "#icons", label: "Loaders" },
    ],
  },
  {
    title: "Not used",
    links: [
      { href: "/kit", label: "Space UI orb (WebGPU)" },
      { href: "/kit", label: "Aceternity (paid)" },
    ],
  },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        {columns.map((column) => (
          <div key={column.title} className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {column.title}
            </h3>
            <ul className="flex flex-col gap-2 text-sm">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link className="hover:underline" href={link.href}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 pb-10 text-xs text-muted-foreground">
        <span>Rhenko component kit</span>
        <span>Sample content only</span>
      </div>
    </footer>
  )
}
