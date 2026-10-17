import { ChevronDown } from "lucide-react"

// Each answer states a limit or behaviour the product enforces, and links to the page that explains it.
export const FAQS: { q: string; a: string; href?: string; cta?: string }[] = [
  {
    q: "Who can use Rhenko?",
    a: "Accounts are for people 18 and older. Creating an account asks you to agree to the current Terms and the Privacy Policy.",
    href: "/privacy",
    cta: "Read the Privacy Policy",
  },
  {
    q: "What does a handle look like?",
    a: "A handle is your username. It has 3 to 15 characters, made of letters, numbers and up to five underscores. Some words are reserved, so the server will say if yours is taken or not allowed.",
  },
  {
    q: "What happens when I tap Not interested?",
    a: "The post leaves your feed. You can also snooze the topic for seven days, follow the account, or mute words.",
  },
  {
    q: "How many people can join a call?",
    a: "A group call holds up to six people. Mute, camera and Leave are on the call screen, and a call tries to reconnect for up to 30 seconds if your connection drops.",
  },
  {
    q: "How do I ask Sahayak something?",
    a: "Mention @sahayak in a post. Sahayak replies in the thread, and it only answers when a post asks for it.",
  },
  {
    q: "How many photos can a post have, and how many accounts can I keep on one device?",
    a: "A post holds up to four photos. On one device you can keep up to five accounts signed in and switch between them.",
  },
  {
    q: "Can I see what Rhenko keeps?",
    a: "Yes. The Privacy Policy and the transparency reports say what is stored and why.",
    href: "/transparency",
    cta: "See the transparency reports",
  },
]

export function Faq() {
  return (
    <div className="divide-y divide-border border-y border-border">
      {FAQS.map((item) => (
        <details key={item.q} className="group py-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mk-rise pt-3 pr-10">
            <p className="max-w-[60ch] text-[15.5px] leading-relaxed text-muted-foreground">{item.a}</p>
            {item.href ? (
              <a href={item.href} className="mt-3 inline-flex text-[14px] font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                {item.cta}
              </a>
            ) : null}
          </div>
        </details>
      ))}
    </div>
  )
}
