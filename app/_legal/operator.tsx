import { Suspense, type ReactNode } from "react"
import { connection } from "next/server"
import { Skeleton } from "@/components/ui/skeleton"
import { P } from "@/app/_legal/shell"

// Who runs this server comes from RHENKO_OPERATOR_NAME and RHENKO_CONTACT_EMAIL. They are read when a page is
// requested, not when the app is built, so one image can run for any operator. Each part waits inside its own
// Suspense boundary, which lets the rest of the page stay static.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function setting(value: string | undefined): string | null {
  const text = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)
  return text === "" ? null : text
}

async function operator(): Promise<{ name: string | null; email: string | null }> {
  await connection()
  return { name: setting(process.env.RHENKO_OPERATOR_NAME), email: setting(process.env.RHENKO_CONTACT_EMAIL) }
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
