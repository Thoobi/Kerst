import { useEffect } from "react"
import { check, type Update } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { info as logInfo, warn as logWarn } from "@tauri-apps/plugin-log"
import { toast } from "sonner"

/** Let startup (models, outputs) settle before going to the network. */
const CHECK_DELAY_MS = 10_000

/**
 * Checks GitHub Releases for a newer Litdeck once per launch and offers it in
 * a toast. Nothing installs without a click: the app may be mid-service, and
 * installing restarts it.
 *
 * The manifest (latest.json) only exists on published releases, so drafts are
 * never offered. Failures are logged, not shown — no network at the venue is
 * normal, not an error worth interrupting anyone for.
 *
 * Mount this hook once, in the main window.
 */
export function useAppUpdate() {
  useEffect(() => {
    if (import.meta.env.DEV) return

    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const update = await check()
        if (!update || cancelled) return
        logInfo(`Update available: ${update.currentVersion} -> ${update.version}`)
        offer(update)
      } catch (e) {
        logWarn(`Update check failed: ${String(e)}`)
      }
    }, CHECK_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])
}

function offer(update: Update) {
  toast(`Litdeck ${update.version} is available`, {
    id: "app-update",
    description: "Installing restarts Litdeck. You can also update later from the next launch.",
    duration: Infinity,
    action: { label: "Install and restart", onClick: () => void install(update) },
    cancel: { label: "Later", onClick: () => {} },
  })
}

async function install(update: Update) {
  let total = 0
  let received = 0
  const toastId = toast.loading(`Downloading Litdeck ${update.version}…`)

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? 0
      } else if (event.event === "Progress") {
        received += event.data.chunkLength
        if (total > 0) {
          const percent = Math.round((received / total) * 100)
          toast.loading(`Downloading Litdeck ${update.version}… ${percent}%`, { id: toastId })
        }
      } else if (event.event === "Finished") {
        toast.loading("Installing…", { id: toastId })
      }
    })
    // Windows quits into the installer before this point; elsewhere we restart.
    await relaunch()
  } catch (e) {
    logWarn(`Update install failed: ${String(e)}`)
    toast.error("Could not install the update", { id: toastId, description: String(e) })
  }
}
