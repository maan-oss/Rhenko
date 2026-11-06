"use client"

// A file in an encrypted chat, shown the way its kind is shown in a plain chat. The file's bytes are fetched and opened here, when the
// bubble shows them, and the decrypted copy lives only in this page's memory: an object URL that is released when the bubble leaves.

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { DocumentCard } from "@/components/app/attachment-view"
import { openSealedFile } from "@/lib/e2ee-client"
import type { SealedMediaView } from "@/lib/e2ee-chat"

export function SealedAttachment({
  conversationId,
  messageId,
  media,
  mine,
  onLoad,
}: {
  conversationId: string
  messageId: string
  media: SealedMediaView
  mine: boolean
  onLoad?: () => void
}) {
  if (media.media === "image") return <SealedPicture conversationId={conversationId} messageId={messageId} media={media} onLoad={onLoad} />
  if (media.media === "document") {
    return <SealedDocument conversationId={conversationId} messageId={messageId} media={media} mine={mine} />
  }
  return (
    <SealedSound
      conversationId={conversationId}
      messageId={messageId}
      media={media}
      label={media.media === "voice" ? "Voice message" : "Audio file"}
      width={media.media === "voice" ? "w-[240px]" : "w-[260px]"}
    />
  )
}

type Opened = { url: string | null; failed: boolean }

// The decrypted file as an object URL, made when the bubble mounts and released when it unmounts.
function useOpenedUrl(conversationId: string, messageId: string, media: SealedMediaView): Opened {
  const [opened, setOpened] = useState<Opened>({ url: null, failed: false })
  useEffect(() => {
    let active = true
    let made: string | null = null
    openSealedFile(conversationId, messageId, media, media.mime).then(
      (blob) => {
        made = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(made)
          return
        }
        setOpened({ url: made, failed: false })
      },
      () => {
        if (active) setOpened({ url: null, failed: true })
      }
    )
    return () => {
      active = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [conversationId, messageId, media])
  return opened
}

function SealedPicture({
  conversationId,
  messageId,
  media,
  onLoad,
}: {
  conversationId: string
  messageId: string
  media: SealedMediaView
  onLoad?: () => void
}) {
  const picture = useOpenedUrl(conversationId, messageId, media)
  if (picture.failed) {
    return <p className="rounded-xl bg-background px-3 py-2 text-sm text-muted-foreground">This picture couldn&apos;t be opened on this device.</p>
  }
  if (picture.url === null) {
    return <span role="img" aria-label="Loading picture" className="block h-40 w-56 max-w-full animate-pulse rounded-xl bg-foreground/10" />
  }
  return (
    <span className="relative block w-fit max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={picture.url} alt={media.scan ? "Scan" : "Shared photo"} onLoad={onLoad} decoding="async" className="max-h-72 max-w-full rounded-xl object-cover" />
      {media.scan ? <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">Scan</span> : null}
    </span>
  )
}

function SealedSound({
  conversationId,
  messageId,
  media,
  label,
  width,
}: {
  conversationId: string
  messageId: string
  media: SealedMediaView
  label: string
  width: string
}) {
  const sound = useOpenedUrl(conversationId, messageId, media)
  if (sound.failed) return <p className="rounded-xl bg-background px-3 py-2 text-sm text-muted-foreground">This recording couldn&apos;t be opened on this device.</p>
  if (sound.url === null) return <span role="status" aria-label="Loading recording" className={`block h-10 ${width} max-w-full animate-pulse rounded-full bg-foreground/10`} />
  return <audio controls preload="metadata" src={sound.url} aria-label={label} className={`block h-10 ${width} max-w-full`} />
}

// A document is opened when its card is pressed, then saved under the name it was sent with.
function SealedDocument({
  conversationId,
  messageId,
  media,
  mine,
}: {
  conversationId: string
  messageId: string
  media: SealedMediaView
  mine: boolean
}) {
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const blob = await openSealedFile(conversationId, messageId, media, "application/octet-stream")
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = media.name
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error("This file couldn't be opened on this device.")
    } finally {
      setSaving(false)
    }
  }

  return <DocumentCard file={media.name} name={media.name} size={media.size} mine={mine} onSave={save} />
}
