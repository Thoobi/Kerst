import { useEffect, useState } from "react"
import { CheckIcon, CopyIcon, LoaderCircleIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"
import { getTauriVersion, getVersion } from "@tauri-apps/api/app"
import { Button } from "@/components/ui/button"
import { checkForUpdateNow } from "@/hooks/use-app-update"

/** The operating system, as the webview reports it. */
function platformName(): string {
  const agent = navigator.userAgent
  if (/Windows/i.test(agent)) return "Windows"
  if (/Mac OS X|Macintosh/i.test(agent)) return "macOS"
  if (/Linux/i.test(agent)) return "Linux"
  return "Unknown"
}

/**
 * Which Litdeck this is: the version (to say when asking for help, or to
 * see whether an update arrived), with a check for a newer one.
 */
export function AboutSection() {
  const [version, setVersion] = useState("")
  const [tauriVersion, setTauriVersion] = useState("")
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => {})
    void getTauriVersion().then(setTauriVersion).catch(() => {})
  }, [])

  const details = [
    `Litdeck ${version || "unknown"}`,
    `Platform: ${platformName()}`,
    tauriVersion && `Tauri: ${tauriVersion}`,
  ]
    .filter(Boolean)
    .join("\n")

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy")
    }
  }

  const checkNow = async () => {
    setChecking(true)
    try {
      const newer = await checkForUpdateNow()
      if (!newer) toast.success("Litdeck is up to date", { description: `You're on ${version}, the latest.` })
    } catch (error) {
      toast.error("Couldn't check for updates", {
        description: `Check the internet connection and try again. (${String(error)})`,
      })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
        <img src="/litdeck.svg" alt="" className="size-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">Litdeck</p>
          <p className="text-sm text-muted-foreground">
            Version <span className="font-mono text-foreground">{version || "…"}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={checking || !version} onClick={() => void checkNow()}>
          {checking ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
          {checking ? "Checking…" : "Check for updates"}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Details</span>
          <Button variant="ghost" size="xs" onClick={() => void copy()} title="Copy these details, e.g. to send with a question">
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 rounded-lg border p-3 text-sm">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono">{version || "…"}</dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd>{platformName()}</dd>
          <dt className="text-muted-foreground">Tauri</dt>
          <dd className="font-mono">{tauriVersion || "…"}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">
          Litdeck also checks for updates on its own a few seconds after it starts, and asks before installing one.
        </p>
      </div>
    </div>
  )
}
