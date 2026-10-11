import { Suspense } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireViewer } from "@/lib/auth"
import { getMiniUserByHandle, threadWith } from "@/lib/data"
import { fullTimestamp } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MessageForm } from "@/components/app/message-form"
import { PageHeader } from "@/components/app/page-header"
import { Poller } from "@/components/app/poller"
import { ThreadMarker } from "@/components/app/thread-marker"

type Params = Promise<{ handle: string }>

export default function ThreadPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <ThreadBody params={params} />
    </Suspense>
  )
}

async function ThreadBody({ params }: { params: Params }) {
  const viewer = await requireViewer()
  const { handle } = await params
  const other = getMiniUserByHandle(handle)
  if (!other) notFound()
  if (other.id === viewer.id) redirect("/messages")

  const messages = threadWith(viewer.id, other.id)
  return (
    <>
      <PageHeader title={other.name} backHref="/messages">
        <Link href={`/${other.handle}`} className="sr-only">
          Profile of @{other.handle}
        </Link>
      </PageHeader>
      <div className="flex min-h-[60dvh] flex-col gap-2 px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No messages yet. Say hello to @{other.handle}.</p>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[80%] px-3.5 py-2 text-[15px] leading-relaxed",
              message.mine ? "ml-auto rounded-lg rounded-br-none bg-primary text-primary-foreground" : "mr-auto rounded-lg rounded-bl-none bg-muted"
            )}
          >
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            <p className={cn("mt-0.5 text-[11px]", message.mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
              {fullTimestamp(message.createdAt)}
            </p>
          </div>
        ))}
      </div>
      <MessageForm handle={other.handle} />
      <ThreadMarker handle={other.handle} />
      <Poller intervalMs={6000} />
    </>
  )
}
