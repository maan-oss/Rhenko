import { requireViewer } from "@/lib/auth"
import { encryptedChatsEnabled } from "@/lib/e2ee-chat"
import { myDevices, pendingDeviceLinks } from "@/actions/e2ee"
import { DevicesPanel } from "@/components/app/devices-panel"
import { PageHeader } from "@/components/app/page-header"
import { RevealSuspense } from "@/components/app/reveal-suspense"

export default function DevicesSettingsPage() {
  return (
    <RevealSuspense>
      <DevicesBody />
    </RevealSuspense>
  )
}

async function DevicesBody() {
  await requireViewer()
  const [devices, pending] = await Promise.all([myDevices(), pendingDeviceLinks()])
  return (
    <>
      <PageHeader title="Devices and encryption" backHref="/settings" />
      <section className="flex flex-col gap-3 border-b border-border px-4 py-4">
        <p className="text-[15px] text-muted-foreground">
          Encrypted chats can be read only on the browsers you link here. Each browser keeps its own keys, and only the public halves are
          kept on the server. A new browser is approved from one that is already linked, and the code must match on both.
        </p>
      </section>
      <div className="flex flex-col gap-6 px-4 py-4">
        <DevicesPanel devices={devices} pending={pending.ok ? pending.links : []} encrypted={encryptedChatsEnabled()} />
      </div>
    </>
  )
}
