import { cn } from "@/lib/utils"

// Photographs of real people, from Unsplash. They are hot-linked from the Unsplash image service, as its licence asks,
// and credited under each one with a link to the photographer's page. Shown in black and white until the viewer hovers,
// so the page keeps one colour: the dusk accent.
export type MarketingPhoto = {
  id: string
  pageId: string
  alt: string
  photographer: string
}

export const PHOTOS = {
  group: {
    id: "1511988617509-a57c8a288659",
    pageId: "three-men-and-one-woman-laughing-during-daytime-e3OUQGT9bWU",
    alt: "Three men and a woman laughing together outdoors on a sunny day",
    photographer: "Helena Lopes",
  },
  videoCall: {
    id: "1758598306835-2c030e203707",
    pageId: "woman-in-a-suit-looking-at-the-camera-MLoyNixjAPo",
    alt: "A smiling woman in a suit waves during a video call from an office",
    photographer: "Vitaly Gariev",
  },
  coffee: {
    id: "1790750557258-8574241c1e2b",
    pageId: "people-in-winter-clothing-with-coffee-71NmVE0gL-o",
    alt: "Four friends in winter clothes raise coffee cups together outdoors",
    photographer: "Vitaly Gariev",
  },
  walking: {
    id: "1758613170939-05179bed0f0c",
    pageId: "four-friends-walking-together-in-a-park-I_0DqZLq4MA",
    alt: "Four friends walk through a park, talking and laughing",
    photographer: "Vitaly Gariev",
  },
  laptop: {
    id: "1713946598526-357e3baaff04",
    pageId: "a-woman-sitting-at-a-table-using-a-laptop-computer-7Mx-hwRb5H4",
    alt: "A woman sits at a table with a laptop and talks with a smile",
    photographer: "Vitaly Gariev",
  },
  home: {
    id: "1633113215883-a43e36bc6178",
    pageId: "man-at-home-wearing-pyjamas-smiling-at-surface-laptop-screen-0WFE46jwO8o",
    alt: "A man at home smiles at a laptop screen",
    photographer: "Surface",
  },
} satisfies Record<string, MarketingPhoto>

export function photoSrc(id: string, width: number) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`
}

export function Photo({
  photo,
  className,
  imgClassName,
  sizes = "(min-width: 1024px) 50vw, 100vw",
  ratio = "4 / 5",
  motion = "none",
  priority = false,
  credit = true,
  children,
}: {
  photo: MarketingPhoto
  className?: string
  imgClassName?: string
  sizes?: string
  ratio?: string
  motion?: "none" | "drift" | "in"
  priority?: boolean
  credit?: boolean
  children?: React.ReactNode
}) {
  const link = `https://unsplash.com/photos/${photo.pageId}?utm_source=rhenko&utm_medium=referral`
  return (
    <figure className={cn("group relative isolate overflow-hidden rounded-[32px] bg-muted", className)} style={{ aspectRatio: ratio }}>
      <img
        src={photoSrc(photo.id, 1200)}
        srcSet={`${photoSrc(photo.id, 800)} 800w, ${photoSrc(photo.id, 1200)} 1200w, ${photoSrc(photo.id, 1800)} 1800w`}
        sizes={sizes}
        alt={photo.alt}
        width={1200}
        height={1500}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        className={cn(
          "absolute inset-0 size-full object-cover grayscale transition-[filter,transform] duration-700 ease-out group-hover:grayscale-0",
          motion === "drift" && "mk-drift",
          motion === "in" && "mk-photo",
          imgClassName
        )}
      />
      {children}
      {credit ? (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-4 pt-10 pb-3 text-[11.5px] text-white/85">
          Photo: {photo.photographer} on{" "}
          <a href={link} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">
            Unsplash
          </a>
        </figcaption>
      ) : null}
    </figure>
  )
}
