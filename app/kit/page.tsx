import { Suspense } from "react"
import { RhenkoSymbol } from "@/components/brand/symbol"
import { SiteNavbar } from "@/components/layout/site-navbar"
import { SectionHeader } from "@/components/layout/section-header"
import { BentoGrid, BentoCell } from "@/components/layout/bento-grid"
import { SiteFooter } from "@/components/layout/site-footer"
import { ChartsDemo } from "@/components/kit/charts-demo"
import { EffectsDemo } from "@/components/kit/effects-demo"
import { IconsDemo } from "@/components/kit/icons-demo"
import { LoadersDemo } from "@/components/kit/loaders-demo"
import { SubmitToastButton } from "@/components/kit/submit-toast-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { BlurFade } from "@/components/ui/blur-fade"
import { BorderBeam } from "@/components/ui/border-beam"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Marquee } from "@/components/ui/marquee"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/animate-ui/components/animate/tabs"
import { Textarea } from "@/components/ui/textarea"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export default function Kit() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <SiteNavbar />

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-10">
        <section className="flex flex-col gap-4">
          <RhenkoSymbol className="size-12" />
          <h1 className="text-4xl font-semibold text-balance">Component kit</h1>
          <p className="max-w-prose text-muted-foreground text-pretty">
            Components from several open sources, restyled to the Rhenko identity.
            Each section names where its parts came from. Sample content only.
          </p>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader id="core" eyebrow="Core" title="Controls and surfaces" description="shadcn/ui on Base UI, with the Rhenko tokens. Animated tabs from Animate UI." />

          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge>New</Badge>
            <Badge variant="secondary">Draft</Badge>
            <Badge variant="outline">Outline</Badge>
            <Avatar className="size-8">
              <AvatarFallback className="text-xs font-semibold">AR</AvatarFallback>
            </Avatar>
            <Avatar className="size-10">
              <AvatarFallback className="text-sm font-semibold">VS</AvatarFallback>
            </Avatar>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="Name" aria-label="Name" />
            <Input placeholder="Handle" aria-label="Handle" />
          </div>
          <Textarea placeholder="Write something" aria-label="Textarea" />

          <Tabs defaultValue="one">
            <TabsList>
              <TabsTrigger value="one">First</TabsTrigger>
              <TabsTrigger value="two">Second</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="pt-3 text-sm text-muted-foreground">Tab one content.</TabsContent>
            <TabsContent value="two" className="pt-3 text-sm text-muted-foreground">Tab two content.</TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Example dialog</DialogTitle>
                  <DialogDescription>Focus stays inside and Escape closes it.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>

            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>Open menu</DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <Separator className="my-1" />
                <DropdownMenuItem>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost" />}>Hover me</TooltipTrigger>
              <TooltipContent>Tooltip text</TooltipContent>
            </Tooltip>

            <SubmitToastButton />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Loading state</CardTitle>
              <CardDescription>Skeleton rows while content arrives.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader id="motion" eyebrow="Motion" title="Effects" description="Magic UI for blur fade, number ticker, border beam and marquee. Componentry for letter cascade, text morph, split-flap, pixel canvas and magnetic dock." />

          <div className="relative overflow-hidden border border-border p-6">
            <BorderBeam size={160} duration={8} colorFrom="var(--ring)" colorTo="var(--foreground)" />
            <p className="text-lg font-semibold">Border beam</p>
            <p className="text-sm text-muted-foreground">Magic UI. Used on the composer while focused.</p>
          </div>

          <div className="-mx-4 overflow-hidden border-y border-border py-3">
            <Marquee pauseOnHover className="[--duration:24s]">
              {["Kharif", "Metro", "Cricket", "Chai", "Exams"].map((t) => (
                <span key={t} className="text-sm font-medium text-muted-foreground">#{t}</span>
              ))}
            </Marquee>
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-semibold tabular-nums">
              <NumberTicker value={1284} />
            </span>
            <span className="text-sm text-muted-foreground">Number ticker, counts up once on view. Sample figure.</span>
          </div>

          <BlurFade inView>
            <p className="text-sm text-muted-foreground">Blur fade on enter (Magic UI).</p>
          </BlurFade>

          <Suspense fallback={<div className="h-48 w-full" />}><EffectsDemo /></Suspense>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader id="icons" eyebrow="Icons and loaders" title="Animated icons and spinners" description="lucide-animated (MIT), react-useanimations (MIT), loading-dev (MIT)." />
          <Suspense fallback={<div className="h-48 w-full" />}><IconsDemo /></Suspense>
          <Suspense fallback={<div className="h-48 w-full" />}><LoadersDemo /></Suspense>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader id="charts" eyebrow="Charts" title="Dashboard charts" description="EvilCharts (MIT), built on Recharts and shadcn tokens. All data here is sample data." />
          <Suspense fallback={<div className="h-48 w-full" />}><ChartsDemo /></Suspense>
        </section>

        <section className="flex flex-col gap-6">
          <SectionHeader id="layouts" eyebrow="Layouts" title="Blocks and patterns" description="Bento grid, section header, footer and 404 page. Patterns taken from bentogrids, footer.design, sectionmaster and 404s.design. No code or designs copied." />
          <BentoGrid>
            <BentoCell className="sm:col-span-2 md:col-span-2 md:row-span-2" title="Wide cell" description="Spans two columns and two rows on desktop. Stacks on phones.">
              <div className="flex items-end gap-2">
                <RhenkoSymbol className="size-10" />
              </div>
            </BentoCell>
            <BentoCell title="Stat" description="Sample figure">
              <span className="text-3xl font-semibold tabular-nums">
                <NumberTicker value={318} />
              </span>
            </BentoCell>
            <BentoCell title="Status" description="Built with shadcn/ui">
              <Badge variant="outline" className="w-fit">Stable</Badge>
            </BentoCell>
            <BentoCell className="sm:col-span-2 md:col-span-2" title="Wide cell" description="Two columns on every size.">
              <div className="h-12 w-full bg-muted" aria-hidden="true" />
            </BentoCell>
          </BentoGrid>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Sources and licences</h2>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li>shadcn/ui: MIT. Base UI primitives: MIT.</li>
            <li>Animate UI (tabs): MIT, plus Commons Clause in the repository licence file.</li>
            <li>Magic UI (blur fade, number ticker, border beam, marquee): MIT.</li>
            <li>Componentry (letter cascade, text morph, split-flap, pixel canvas, magnetic dock): MIT.</li>
            <li>EvilCharts (area, bar, donut): MIT.</li>
            <li>lucide-animated, react-useanimations, loading-dev: MIT.</li>
            <li>Not used: Space UI orb (needs WebGPU), Rare UI (MIT + Commons Clause + attribution), Skecher UI (no licence stated), Planes (paid), Aceternity (paid, no redistribution).</li>
            <li>Galleries used for patterns only: bentogrids, footer.design, sectionmaster, 404s.design, navbar.gallery.</li>
          </ul>
          <RhenkoSymbol className="mt-6 size-6 text-muted-foreground" label="" />
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
