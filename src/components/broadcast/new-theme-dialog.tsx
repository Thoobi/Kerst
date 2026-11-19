import { useBroadcastStore, type NewThemeLayoutKind } from "@/stores/broadcast-store"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

function LayoutOption({
  title,
  description,
  preview,
  onSelect,
}: {
  title: string
  description: string
  preview: React.ReactNode
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left",
        "transition-colors hover:border-primary focus-visible:border-primary focus-visible:outline-none"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
        {preview}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </button>
  )
}

export function NewThemeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const handleCreate = (kind: NewThemeLayoutKind) => {
    useBroadcastStore.getState().createNewTheme(kind)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Theme</DialogTitle>
          <DialogDescription>Choose a starting layout.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <LayoutOption
            title="Full Screen"
            description="Solid background filling the whole frame"
            onSelect={() => handleCreate("fullscreen")}
            preview={
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-zinc-900">
                <div className="h-1.5 w-1/2 rounded-sm bg-zinc-500" />
                <div className="h-1.5 w-2/3 rounded-sm bg-zinc-600" />
                <div className="h-1.5 w-3/5 rounded-sm bg-zinc-600" />
              </div>
            }
          />
          <LayoutOption
            title="Lower Thirds"
            description="Transparent overlay with a text band at the bottom"
            onSelect={() => handleCreate("lower-thirds")}
            preview={
              <div className="absolute inset-0 bg-[repeating-conic-gradient(theme(colors.zinc.700)_0%_25%,theme(colors.zinc.800)_0%_50%)] bg-[length:12px_12px]">
                <div className="absolute inset-x-2 bottom-1.5 flex h-1/3 flex-col items-center justify-center gap-1 rounded-sm bg-zinc-950/80">
                  <div className="h-1 w-2/3 rounded-sm bg-zinc-400" />
                  <div className="h-1 w-1/3 rounded-sm bg-amber-400/80" />
                </div>
              </div>
            }
          />
          <LayoutOption
            title="Custom"
            description="Place the reference and words anywhere: drag and resize each box"
            onSelect={() => handleCreate("custom")}
            preview={
              <div className="absolute inset-0 bg-zinc-900">
                <div className="absolute top-[14%] left-[8%] h-[14%] w-[40%] rounded-sm border border-dashed border-amber-400/80 p-1">
                  <div className="h-1 w-2/3 rounded-sm bg-amber-400/80" />
                </div>
                <div className="absolute top-[38%] right-[8%] flex h-[48%] w-[58%] flex-col justify-center gap-1 rounded-sm border border-dashed border-amber-400/80 p-1.5">
                  <div className="h-1.5 w-full rounded-sm bg-zinc-500" />
                  <div className="h-1.5 w-4/5 rounded-sm bg-zinc-600" />
                </div>
              </div>
            }
          />
          <LayoutOption
            title="Side by Side"
            description="A camera on one side and the words level with it, over your own background"
            onSelect={() => handleCreate("side-by-side")}
            preview={
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 to-zinc-950">
                <div className="absolute top-1/4 left-[4%] h-1/2 w-1/2 rounded-md bg-zinc-700 shadow-lg" />
                <div className="absolute top-1/4 right-[4%] flex h-1/2 w-[38%] flex-col justify-center gap-1">
                  <div className="h-1.5 w-full rounded-sm bg-zinc-300" />
                  <div className="h-1.5 w-4/5 rounded-sm bg-zinc-300" />
                  <div className="h-1.5 w-3/5 rounded-sm bg-zinc-300" />
                </div>
              </div>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
