import { Search } from "lucide-react"

// A plain GET form, so searches work without JavaScript and can be bookmarked.
export function SearchField({ defaultQuery, type, className = "px-4 pt-3 pb-3" }: { defaultQuery: string; type?: string; className?: string }) {
  return (
    <form action="/search" role="search" className={className}>
      {type ? <input type="hidden" name="f" value={type} /> : null}
      <label htmlFor="search-q" className="sr-only">
        Search Rhenko
      </label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="search-q"
          name="q"
          type="search"
          defaultValue={defaultQuery}
          placeholder="Search posts and people"
          autoComplete="off"
          className="h-12 w-full rounded-full border border-transparent bg-muted pr-4 pl-11 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-dusk focus:bg-background"
        />
      </div>
    </form>
  )
}
