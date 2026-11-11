import { requireViewer } from "@/lib/auth"
import { encryptedChatsEnabled } from "@/lib/e2ee-chat"
import { copyableDeviceLinks, myDevices, pendingDeviceLinks } from "@/actions/e2ee"
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
  const [devices, pending, copyable] = await Promise.all([myDevices(), pendingDeviceLinks(), copyableDeviceLinks()])
  return (
    <>
      <PageHeader title="Devices" backHref="/settings" />
      <div className="flex flex-col gap-6 px-4 py-4">
        <DevicesPanel
          devices={devices}
          pending={pending.ok ? pending.links : []}
          copyable={copyable.ok ? copyable.links : []}
          encrypted={encryptedChatsEnabled()}
        />
      </div>
    </>
  )
}
