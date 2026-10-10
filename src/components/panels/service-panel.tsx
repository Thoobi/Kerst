import { useEffect, useState } from "react"
import { ask } from "@tauri-apps/plugin-dialog"
import { toast } from "sonner"
import { DragDropProvider } from "@dnd-kit/react"
import { isSortable, useSortable } from "@dnd-kit/react/sortable"
import {
  BookOpenIcon,
  CalendarIcon,
  FilmIcon,
  GripVerticalIcon,
  ListOrderedIcon,
  MegaphoneIcon,
  MoreHorizontalIcon,
  MusicIcon,
  PlusIcon,
  PresentationIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AddServiceItemDialog } from "@/components/panels/add-service-item-dialog"
import { ADDABLE, type AddableKind } from "@/lib/service-items"
import { cn } from "@/lib/utils"
import { todayIso, useServiceStore } from "@/stores/service-store"
import type { ScheduleItem } from "@/types"

/** "Sun 12 Oct" for a YYYY-MM-DD date. */
function formatDate(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
}

function KindIcon({ kind }: { kind: ScheduleItem["kind"] }) {
  const className = "size-3.5 shrink-0 text-muted-foreground"
  switch (kind) {
    case "song":
      return <MusicIcon className={className} />
    case "scripture":
      return <BookOpenIcon className={className} />
    case "deck":
      return <PresentationIcon className={className} />
    case "media":
      return <FilmIcon className={className} />
    case "announcement":
      return <MegaphoneIcon className={className} />
    default:
      return <ListOrderedIcon className={className} />
  }
}
const kindLabel = (kind: ScheduleItem["kind"]) => ADDABLE.find((a) => a.kind === kind)?.label ?? kind

/**
 * The running order of a service: songs, scripture, slides, videos and
 * texts in the order they happen. Drag to rearrange; click an item to open
 * it in its tab, ready to present.
 */
export function ServicePanel() {
  const services = useServiceStore((s) => s.services)
  const active = useServiceStore((s) => s.active)
  const activeItemId = useServiceStore((s) => s.activeItemId)
  const loadError = useServiceStore((s) => s.loadError)
  const [adding, setAdding] = useState<AddableKind | null>(null)
  const [details, setDetails] = useState<"new" | "edit" | null>(null)

  useEffect(() => {
    void useServiceStore.getState().loadServices()
  }, [])

  const run = (action: () => Promise<void>, failure: string) => {
    void action().catch((error) => toast.error(failure, { description: String(error) }))
  }

  const onDelete = async () => {
    if (!active) return
    const confirmed = await ask(`Delete the service “${active.name}”? The songs and texts in it stay in the library.`, {
      title: "Delete service",
      kind: "warning",
      okLabel: "Delete",
    })
    if (confirmed) run(() => useServiceStore.getState().deleteService(active.id), "Could not delete the service")
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loadError ? (
        <p className="p-3 text-xs text-destructive">{loadError}</p>
      ) : !active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <ListOrderedIcon className="size-7 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Plan a service</p>
            <p className="mt-1 max-w-56 text-xs text-muted-foreground">
              Line up the songs, readings, slides, videos and announcements in the order they happen.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setDetails("new")}>
            <PlusIcon />
            New service
          </Button>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-1 px-2 pb-1.5">
            <Select
              value={active.id}
              onValueChange={(id) => run(() => useServiceStore.getState().openService(id), "Could not open the service")}
            >
              <SelectTrigger size="sm" className="h-8 min-w-0 flex-1 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                    {s.service_date && <span className="text-muted-foreground"> · {formatDate(s.service_date)}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Service options">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={() => setDetails("new")}>
                  <PlusIcon />
                  New service
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDetails("edit")}>
                  <CalendarIcon />
                  Rename or redate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void onDelete()}>
                  <XIcon />
                  Delete service
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
            {active.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                Add the first item with the button below.
              </p>
            ) : (
              <DragDropProvider
                onDragEnd={(event) => {
                  if (event.canceled) return
                  const { source } = event.operation
                  if (isSortable(source) && source.initialIndex !== source.index) {
                    run(
                      () => useServiceStore.getState().reorder(source.initialIndex, source.index),
                      "Could not save the new order"
                    )
                  }
                }}
              >
                <ol className="flex flex-col gap-0.5 pb-1.5">
                  {active.items.map((item, index) => (
                    <ServiceRow
                      key={item.id}
                      item={item}
                      index={index}
                      active={item.id === activeItemId}
                      onOpen={() =>
                        run(() => useServiceStore.getState().openItem(item.id), `Could not open “${item.title}”`)
                      }
                      onRemove={() =>
                        run(() => useServiceStore.getState().removeItem(item.id), "Could not remove it")
                      }
                    />
                  ))}
                </ol>
              </DragDropProvider>
            )}
          </div>

          <div className="shrink-0 border-t border-border p-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <PlusIcon />
                  Add to service
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {ADDABLE.map(({ kind, label, icon: Icon }) => (
                  <DropdownMenuItem key={kind} onSelect={() => setAdding(kind)}>
                    <Icon />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}

      <AddServiceItemDialog kind={adding} onClose={() => setAdding(null)} />
      <ServiceDetailsDialog mode={details} onClose={() => setDetails(null)} />
    </div>
  )
}

function ServiceRow({
  item,
  index,
  active,
  onOpen,
  onRemove,
}: {
  item: ScheduleItem
  index: number
  active: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: item.id, index })
  return (
    <li
      ref={ref}
      onClick={onOpen}
      className={cn(
        "group relative flex h-9 cursor-pointer items-center gap-2 rounded-lg px-1.5 transition-colors",
        active ? "bg-primary/10" : "hover:bg-muted/60",
        isDragging && "opacity-60"
      )}
      title={`${kindLabel(item.kind)}: open it ready to present`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" />}
      <button
        ref={handleRef}
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
        aria-label="Drag to reorder"
      >
        <span className="font-mono text-[0.6875rem] tabular-nums group-hover:hidden">{index + 1}</span>
        <GripVerticalIcon className="hidden size-4 group-hover:block" />
      </button>
      <KindIcon kind={item.kind} />
      <span className={cn("flex-1 truncate text-sm", active ? "font-semibold" : "font-medium text-foreground/90")}>
        {item.title}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        className="hidden shrink-0 group-hover:flex"
        title="Remove from the service"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
      >
        <XIcon />
      </Button>
    </li>
  )
}

/** Name and date for a new service, or to change the open one's. */
function ServiceDetailsDialog({ mode, onClose }: { mode: "new" | "edit" | null; onClose: () => void }) {
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-sm">
        {mode && <ServiceDetailsForm key={mode} mode={mode} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ServiceDetailsForm({ mode, onClose }: { mode: "new" | "edit"; onClose: () => void }) {
  const active = useServiceStore((s) => s.active)
  const [name, setName] = useState(mode === "edit" ? (active?.name ?? "") : "Sunday Service")
  const [date, setDate] = useState(mode === "edit" ? (active?.service_date ?? "") : todayIso())
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const store = useServiceStore.getState()
      if (mode === "new") await store.createService(name.trim(), date || null)
      else await store.updateService({ name, serviceDate: date || null })
      onClose()
    } catch (error) {
      toast.error("Could not save the service", { description: String(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div>
        <DialogTitle>{mode === "new" ? "New service" : "Service details"}</DialogTitle>
        <DialogDescription className="mt-1 text-xs">Name it and pick the day it happens.</DialogDescription>
      </div>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Service name" />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Service date" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || saving}>
          {mode === "new" ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  )
}
