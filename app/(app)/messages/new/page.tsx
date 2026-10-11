import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/app/page-header"
import { NewChatForm, NewGroupForm } from "@/components/app/new-message-forms"

export default function NewMessagePage() {
  return (
    <>
      <PageHeader title="New message" backHref="/messages" />
      <section className="flex flex-col gap-3 border-b border-border px-4 py-5">
        <h2 className="text-lg font-semibold">Message someone</h2>
        <p className="text-sm text-muted-foreground">
          If they don&apos;t follow you, your first message waits as a request until they accept.
        </p>
        <NewChatForm />
      </section>
      <section className="flex flex-col gap-3 px-4 py-5">
        <h2 className="text-lg font-semibold">Start a group</h2>
        <p className="text-sm text-muted-foreground">
          Add two or more people. Groups hold up to 50 people. Anyone who doesn&apos;t follow you gets an invite and joins once they accept.
        </p>
        <NewGroupForm />
      </section>
      <div className="px-4 pb-6">
        <Link href="/messages" className="inline-flex items-center gap-2 text-sm font-semibold text-dusk hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to messages
        </Link>
      </div>
    </>
  )
}
