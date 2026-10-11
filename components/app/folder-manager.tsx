"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FolderPlus } from "lucide-react"
import { toast } from "sonner"
import { createFolder, deleteFolder } from "@/actions/posts"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { MAX_FOLDER_NAME } from "@/lib/rules"

// Create and delete bookmark folders. Deleting a folder keeps its bookmarks, unfiled.
export function FolderManager({ folders }: { folders: { id: string; name: string; count: number }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-9 rounded-lg px-3" />}>
        <FolderPlus className="size-4" />
        Folders
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md" showCloseButton>
        <DialogTitle className="pr-8 text-lg font-semibold">Bookmark folders</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">Sort saved posts into folders. Only you can see them.</DialogDescription>
        <form
          ref={formRef}
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const formData = new FormData(event.currentTarget)
            startTransition(async () => {
              const result = await createFolder(formData)
              if (!result.ok) toast.error(result.error)
              else {
                formRef.current?.reset()
                toast.success("Folder created.")
                router.refresh()
              }
            })
          }}
        >
          <label htmlFor="folder-name" className="sr-only">
            Folder name
          </label>
          <input
            id="folder-name"
            name="name"
            required
            maxLength={MAX_FOLDER_NAME}
            placeholder="New folder name"
            className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-foreground/50"
          />
          <Button type="submit" disabled={pending} className="h-11 rounded-lg px-4">
            Create
          </Button>
        </form>
        {folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No folders yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {folders.map((folder) => (
              <li key={folder.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{folder.name}</span>{" "}
                  <span className="text-sm text-muted-foreground">
                    {folder.count} {folder.count === 1 ? "bookmark" : "bookmarks"}
                  </span>
                </span>
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" className="h-8 rounded-lg px-3 text-destructive">
                      Delete
                    </Button>
                  }
                  title={`Delete “${folder.name}”?`}
                  description="The folder goes away. Its bookmarks stay saved, outside any folder."
                  confirmLabel="Delete folder"
                  action={() => deleteFolder(folder.id)}
                  onDone={() => router.refresh()}
                />
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
