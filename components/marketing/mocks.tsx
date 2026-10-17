import { Mic, PhoneOff, Video } from "lucide-react"
import { cn } from "@/lib/utils"
import { PHOTOS, photoSrc } from "@/components/marketing/photo"

// Product pictures for the landing page, drawn with the app's own tokens. They show the shape of the product, not any
// person's account. The first names are invented for the picture; the faces are real photographs from Unsplash, credited
// under the grid.

const CALL_PEOPLE = [
  { name: "Maya", photo: PHOTOS.videoCall },
  { name: "Dev", photo: PHOTOS.group },
  { name: "Iris", photo: PHOTOS.coffee },
  { name: "Sam", photo: PHOTOS.walking },
]

const unsplash = (pageId: string) => `https://unsplash.com/photos/${pageId}?utm_source=rhenko&utm_medium=referral`

export function CallGrid({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="grid grid-cols-3 gap-2">
        {CALL_PEOPLE.map((person) => (
          <div key={person.name} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
            <img
              src={photoSrc(person.photo.id, 480)}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover object-top grayscale"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-7 pb-2 text-[12px] font-semibold text-white">
              {person.name}
            </span>
          </div>
        ))}
        {[0, 1].map((slot) => (
          <div key={slot} className="flex aspect-[4/3] items-end rounded-2xl border border-dashed border-border p-2.5 text-[12px] text-muted-foreground">
            Ringing
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        Photos on{" "}
        <a href={unsplash(PHOTOS.videoCall.pageId)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          Unsplash
        </a>{" "}
        by Vitaly Gariev and{" "}
        <a href={unsplash(PHOTOS.group.pageId)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          Helena Lopes
        </a>
        .
      </p>
    </div>
  )
}

export function CallMock({ className }: { className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[28px] border border-border bg-card p-5 shadow-[0_30px_80px_-40px_rgba(10,10,10,0.35)]", className)}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[15px] font-semibold">Group call</div>
          <div className="text-[13px] text-muted-foreground">Up to six people</div>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-[12.5px] font-semibold">4 in call</span>
      </div>
      <CallGrid />
      <div className="mt-4 flex items-center justify-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-full border border-border"><Mic className="size-[18px]" /></span>
        <span className="flex size-11 items-center justify-center rounded-full border border-border"><Video className="size-[18px]" /></span>
        <span className="flex h-11 items-center gap-2 rounded-full bg-[var(--dusk)] px-5 text-[13.5px] font-semibold text-white">
          <PhoneOff className="size-4" /> Leave
        </span>
      </div>
    </div>
  )
}
