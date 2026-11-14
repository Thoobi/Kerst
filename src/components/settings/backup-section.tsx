import { useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { ask, open, save } from "@tauri-apps/plugin-dialog"
import { relaunch } from "@tauri-apps/plugin-process"
import { ArchiveRestoreIcon, DownloadIcon, LoaderCircleIcon, ShieldAlertIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { todayIso } from "@/stores/service-store"

interface BackupInfo {
  appVersion: string
  createdAt: number
  includesMedia: boolean
}

/** Long enough for the latest change to reach disk (stores save within half a second). */
const SETTLE_MS = 1000

/**
 * One-click backup of everything made in Litdeck, and restoring it on this
 * or another computer.
 */
export function BackupSection() {
  const [includeMedia, setIncludeMedia] = useState(false)
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null)

  const backUp = async () => {
    const path = await save({
      defaultPath: `Litdeck backup ${todayIso()}.zip`,
      filters: [{ name: "Litdeck backup", extensions: ["zip"] }],
    })
    if (!path) return
    setBusy("backup")
    try {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
      await invoke<BackupInfo>("create_backup", { path, includeMedia })
      toast.success("Backed up", { description: path })
    } catch (error) {
      toast.error("Could not back up", { description: String(error) })
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    const path = await open({ multiple: false, filters: [{ name: "Litdeck backup", extensions: ["zip"] }] })
    if (typeof path !== "string") return
    setBusy("restore")
    try {
      const info = await invoke<BackupInfo>("read_backup", { path })
      const made = new Date(info.createdAt).toLocaleString()
      const sure = await ask(
        `Restore the backup from ${made} (Litdeck ${info.appVersion})?\n\n` +
          "It replaces this computer's settings, themes, outputs, scenes, cameras, names and library" +
          (info.includesMedia ? ", videos and slide images" : "") +
          ". Litdeck restarts to finish.",
        { title: "Restore backup", kind: "warning", okLabel: "Restore and restart", cancelLabel: "Cancel" }
      )
      if (!sure) return
      await invoke("stage_backup_restore", { path })
      await relaunch()
    } catch (error) {
      toast.error("Could not restore", { description: String(error) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Keep everything you&apos;ve set up in one file: settings, themes, outputs, scenes, cameras, names, and your
        library of songs, services, texts and slides. Restore it after a reinstall or on a new computer.
      </p>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Back up now</p>
            <p className="text-xs text-muted-foreground">Saves a .zip file wherever you choose, e.g. a USB stick.</p>
          </div>
          <Button onClick={() => void backUp()} disabled={busy !== null}>
            {busy === "backup" ? <LoaderCircleIcon className="animate-spin" /> : <DownloadIcon />}
            {busy === "backup" ? "Backing up…" : "Back up…"}
          </Button>
        </div>
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs">
            <span className="font-medium">Include videos and slide images</span>
            <span className="block text-muted-foreground">Can make the file large.</span>
          </span>
          <Switch checked={includeMedia} onCheckedChange={setIncludeMedia} aria-label="Include videos and slide images" />
        </label>
        <p className="flex items-start gap-1.5 text-[0.6875rem] text-amber-600 dark:text-amber-400">
          <ShieldAlertIcon className="mt-px size-3.5 shrink-0" />
          The file includes your API keys: keep it somewhere safe.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">Restore from a backup</p>
          <p className="text-xs text-muted-foreground">Replaces what&apos;s on this computer, then restarts Litdeck.</p>
        </div>
        <Button variant="outline" onClick={() => void restore()} disabled={busy !== null}>
          {busy === "restore" ? <LoaderCircleIcon className="animate-spin" /> : <ArchiveRestoreIcon />}
          Restore…
        </Button>
      </div>
    </div>
  )
}
