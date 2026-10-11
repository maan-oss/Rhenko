import { Suspense, type ReactNode } from "react"
import { connection } from "next/server"
import { Skeleton } from "@/components/ui/skeleton"
import { P } from "@/app/_legal/shell"

// Who runs this server and how to reach them come from RHENKO_* variables. They are read when a page is requested,
// not when the app is built, so one image can run for any operator. Each part waits inside its own Suspense boundary,
// which lets the rest of the page stay static. A detail that is not set says so, rather than showing a blank.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The details a policy may need. Each one is optional on the server, and the pages say when one is missing.
const VARIABLES = {
  name: "RHENKO_OPERATOR_NAME",
  contact: "RHENKO_CONTACT_EMAIL",
  address: "RHENKO_OPERATOR_ADDRESS",
  privacyEmail: "RHENKO_PRIVACY_EMAIL",
  grievanceOfficer: "RHENKO_GRIEVANCE_OFFICER",
  grievanceEmail: "RHENKO_GRIEVANCE_EMAIL",
  copyrightAgent: "RHENKO_COPYRIGHT_AGENT_NAME",
  copyrightEmail: "RHENKO_COPYRIGHT_AGENT_EMAIL",
  copyrightAddress: "RHENKO_COPYRIGHT_AGENT_ADDRESS",
  euRepresentative: "RHENKO_EU_REPRESENTATIVE",
  ukRepresentative: "RHENKO_UK_REPRESENTATIVE",
  hosting: "RHENKO_HOSTING_LOCATION",
  governingLaw: "RHENKO_GOVERNING_LAW",
} as const

export type OperatorSetting = keyof typeof VARIABLES

function setting(value: string | undefined, max = 200): string | null {
  const text = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
  return text === "" ? null : text
}

async function published(which: OperatorSetting, max?: number): Promise<string | null> {
  await connection()
  return setting(process.env[VARIABLES[which]], max)
}

async function operator(): Promise<{ name: string | null; email: string | null }> {
  return { name: await published("name"), email: await published("contact") }
}

function Email({ address }: { address: string }) {
  if (!EMAIL.test(address)) return <strong className="font-semibold">{address}</strong>
  return (
    <a href={`mailto:${address}`} className="font-semibold text-dusk underline underline-offset-4">
      {address}
    </a>
  )
}

function Waiting({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Skeleton className="h-5 w-3/4" />}>{children}</Suspense>
}

async function Who() {
  const { name, email } = await operator()
  if (name && email) {
    return (
      <P>
        This server is run by <strong className="font-semibold">{name}</strong>. You can reach them at <Email address={email} />.
      </P>
    )
  }
  if (name) {
    return (
      <P>
        This server is run by <strong className="font-semibold">{name}</strong>, who has not published a contact address.
      </P>
    )
  }
  if (email) {
    return (
      <P>
        The operator of this server has not published a name. You can reach them at <Email address={email} />.
      </P>
    )
  }
  return <P>The operator of this server has not published a name or contact details.</P>
}

// Who runs this server, as a sentence.
export function OperatorWho() {
  return (
    <Waiting>
      <Who />
    </Waiting>
  )
}

async function Reach({ about, without }: { about: string; without: string }) {
  const { email } = await operator()
  if (email) {
    return (
      <P>
        {about} Write to <Email address={email} />.
      </P>
    )
  }
  return <P>The operator of this server has not published a contact address, so there is no one to write to from this page. {without}</P>
}

// How to reach the operator. `about` says what to write about; `without` says what to do when no address is published.
export function OperatorContact({ about, without }: { about: string; without: string }) {
  return (
    <Waiting>
      <Reach about={about} without={without} />
    </Waiting>
  )
}

async function Value({ which, missing, email, max }: { which: OperatorSetting; missing: string; email?: boolean; max?: number }) {
  const text = await published(which, max)
  if (text === null) return <>{missing}</>
  if (email && EMAIL.test(text)) return <Email address={text} />
  return <strong className="font-semibold">{text}</strong>
}

// One published detail inline, such as the privacy contact or the copyright agent's address. `missing` is what the page
// says while the operator has not set it.
export function OperatorValue({
  which,
  missing = "not yet published",
  email = false,
  max,
}: {
  which: OperatorSetting
  missing?: string
  email?: boolean
  max?: number
}) {
  // Inline inside a paragraph, so the fallback is text, not a block.
  return (
    <Suspense fallback={null}>
      <Value which={which} missing={missing} email={email} max={max} />
    </Suspense>
  )
}

// A full line for a block of details, shown only when the operator has set the value.
async function Line({ which, label, email, max }: { which: OperatorSetting; label: string; email?: boolean; max?: number }) {
  const text = await published(which, max)
  if (text === null) return null
  return (
    <li>
      <span className="font-semibold">{label}:</span>{" "}
      {email && EMAIL.test(text) ? <Email address={text} /> : text}
    </li>
  )
}

// A list of details, each on its own line, with the ones not set left out.
export function OperatorLines({ items }: { items: { which: OperatorSetting; label: string; email?: boolean; max?: number }[] }) {
  return (
    <Waiting>
      <ul className="flex flex-col gap-2 pl-5 text-[15px] leading-[1.7] list-disc marker:text-muted-foreground">
        {items.map((item) => (
          <Line key={item.which} {...item} />
        ))}
      </ul>
    </Waiting>
  )
}
