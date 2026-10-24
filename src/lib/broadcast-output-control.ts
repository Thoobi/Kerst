import { toast } from "sonner"
import { info as logInfo, error as logError } from "@tauri-apps/plugin-log"
import { invoke } from "@tauri-apps/api/core"
import { emitTo } from "@tauri-apps/api/event"
import { getAllWindows } from "@tauri-apps/api/window"
import { useBroadcastStore } from "@/stores"
import type {
  BroadcastOutput,
  NdiAlphaMode,
  NdiFrameRate,
  NdiResolution,
  NdiSessionInfo,
  NdiStartRequest,
  StreamStartRequest,
  StreamStatus,
} from "@/types"
import { outputWindowLabel } from "@/types"

export const STREAM_RESOLUTION_OPTIONS: Array<{ value: "r1080p" | "r720p"; label: string }> = [
  { value: "r1080p", label: "1080p (1920×1080)" },
  { value: "r720p", label: "720p (1280×720)" },
]

/** YouTube's and Facebook's recommendations, roughly, for 720p–1080p. */
export const STREAM_BITRATE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 2500, label: "2.5 Mbps" },
  { value: 4500, label: "4.5 Mbps" },
  { value: 6000, label: "6 Mbps" },
  { value: 8000, label: "8 Mbps" },
]

export const STREAM_PLATFORM_LABELS = {
  youtube: "YouTube",
  facebook: "Facebook",
  custom: "Custom RTMP",
} as const

/** Destinations that can actually be streamed to. */
export function readyDestinations(output: BroadcastOutput) {
  return output.stream.destinations.filter((d) => d.enabled && d.key.trim() && d.url.trim())
}

function streamStartRequest(output: BroadcastOutput): StreamStartRequest {
  const { width, height } = ndiResolutionDimensions(output.stream.resolution)
  return {
    width,
    height,
    fps: ndiFrameRateToNumber(output.stream.frameRate),
    videoBitrateKbps: output.stream.videoBitrateKbps,
    audioBitrateKbps: 160,
    audioDevice: output.stream.audioDevice,
    audioDelayMs: output.stream.audioDelayMs,
    camera: output.stream.camera,
    destinations: readyDestinations(output).map((d) => ({
      id: d.id,
      name: STREAM_PLATFORM_LABELS[d.platform],
      url: d.url.trim(),
      key: d.key.trim(),
    })),
  }
}

export const NDI_RESOLUTION_OPTIONS: Array<{ value: NdiResolution; label: string }> = [
  { value: "r1080p", label: "1080p (1920×1080)" },
  { value: "r720p", label: "720p (1280×720)" },
  { value: "r4k", label: "4K (3840×2160)" },
]

export const NDI_FRAME_RATE_OPTIONS: Array<{ value: NdiFrameRate; label: string }> = [
  { value: "fps24", label: "24 fps" },
  { value: "fps30", label: "30 fps" },
  { value: "fps60", label: "60 fps" },
]

export const NDI_ALPHA_OPTIONS: Array<{ value: NdiAlphaMode; label: string }> = [
  { value: "noneOpaque", label: "None (Opaque)" },
  { value: "straightAlpha", label: "Straight Alpha" },
  { value: "premultipliedAlpha", label: "Premultiplied Alpha" },
]

export function ndiFrameRateToNumber(frameRate: NdiFrameRate): number {
  switch (frameRate) {
    case "fps24":
      return 24
    case "fps30":
      return 30
    case "fps60":
      return 60
  }
}

export function ndiResolutionDimensions(resolution: NdiResolution): {
  width: number
  height: number
} {
  switch (resolution) {
    case "r720p":
      return { width: 1280, height: 720 }
    case "r4k":
      return { width: 3840, height: 2160 }
    case "r1080p":
      return { width: 1920, height: 1080 }
  }
}

/** Tell the output window whether (and how) to pump frames to NDI or a stream. */
export function syncCaptureConfigToOutput(output: BroadcastOutput, active: boolean): void {
  const settings = output.type === "stream" ? output.stream : output.ndi
  const dims = ndiResolutionDimensions(settings.resolution)
  void emitTo(outputWindowLabel(output.id), "broadcast:capture-config", {
    active,
    fps: ndiFrameRateToNumber(settings.frameRate),
    width: dims.width,
    height: dims.height,
  }).catch(() => {})
}

/**
 * A window hidden for NDI still exists — only a visible one counts as an
 * open preview.
 */
async function isPreviewWindowVisible(outputId: string): Promise<boolean> {
  try {
    const windows = await getAllWindows()
    const window = windows.find((w) => w.label === outputWindowLabel(outputId))
    return window ? await window.isVisible() : false
  } catch {
    return false
  }
}

/** Refresh the store's runtime status for one output from the OS. */
export async function reconcileOutputStatus(output: BroadcastOutput): Promise<void> {
  const previewOpen = await isPreviewWindowVisible(output.id)
  let ndiActive = false
  let streamActive = false
  try {
    const [ndi, stream] = await Promise.all([
      invoke<{ active: boolean } | null>("get_ndi_status", { outputId: output.id }),
      invoke<StreamStatus | null>("get_stream_status", { outputId: output.id }),
    ])
    ndiActive = ndi?.active ?? false
    streamActive = stream !== null
  } catch {
    // Status stays false if the command fails.
  }
  const store = useBroadcastStore.getState()
  // The output may have been removed while these queries were in flight.
  if (!store.outputs.some((o) => o.id === output.id)) return
  store.setOutputStatus(output.id, { previewOpen, ndiActive, streamActive })
}

/**
 * Put an output on air: open its projector window (display) or start its NDI
 * sender (ndi). Returns whether the output actually came up. Errors surface
 * as toasts.
 */
export async function enableOutput(output: BroadcastOutput): Promise<boolean> {
  const store = useBroadcastStore.getState()
  try {
    if (output.type === "display") {
      await invoke("open_broadcast_window", {
        outputId: output.id,
        monitorIndex: output.monitorIndex,
        title: output.name,
      })
      const opened = await isPreviewWindowVisible(output.id)
      void logInfo(`[broadcast-ui] open_broadcast_window '${output.id}' ok, visible=${opened}`)
      store.setOutputStatus(output.id, { previewOpen: opened, ndiActive: false, streamActive: false })
      if (!opened) return false
      store.syncBroadcastOutputFor(output.id)
      syncCaptureConfigToOutput(output, false)
      // The window may still be booting; re-send the verse once it settles.
      setTimeout(() => {
        useBroadcastStore.getState().syncBroadcastOutputFor(output.id)
      }, 150)
      return true
    }

    if (output.type === "stream") {
      if (readyDestinations(output).length === 0) {
        throw new Error("Add a stream key for YouTube, Facebook or another destination first.")
      }
      await invoke("ensure_broadcast_window", {
        outputId: output.id,
        title: `${output.name} (Livestream)`,
      })
      const status = await invoke<StreamStatus>("start_stream", {
        outputId: output.id,
        request: streamStartRequest(output),
      })
      void logInfo(
        `[broadcast-ui] start_stream '${output.id}' ok: ${status.width}x${status.height}@${status.fps} via ${status.encoder} to ${status.destinations.length} destination(s)`,
      )
      store.setOutputStatus(output.id, { previewOpen: false, ndiActive: false, streamActive: true })
      store.syncBroadcastOutputFor(output.id)
      syncCaptureConfigToOutput(output, true)
      setTimeout(() => {
        useBroadcastStore.getState().syncBroadcastOutputFor(output.id)
        syncCaptureConfigToOutput(output, true)
      }, 300)
      return true
    }

    await invoke("ensure_broadcast_window", {
      outputId: output.id,
      title: `${output.name} (NDI)`,
    })
    const request: NdiStartRequest = { ...output.ndi }
    const session = await invoke<NdiSessionInfo>("start_ndi", {
      outputId: output.id,
      request,
    })
    void logInfo(
      `[broadcast-ui] start_ndi '${output.id}' ok: ${session.sourceName} ${session.width}x${session.height}@${session.fps}`,
    )
    store.setOutputStatus(output.id, { previewOpen: false, ndiActive: true, streamActive: false })
    store.syncBroadcastOutputFor(output.id)
    void emitTo(outputWindowLabel(output.id), "broadcast:capture-config", {
      active: true,
      fps: session.fps,
      width: session.width,
      height: session.height,
    }).catch(() => {})
    // The hidden window renders asynchronously; nudge it again shortly.
    setTimeout(() => {
      useBroadcastStore.getState().syncBroadcastOutputFor(output.id)
      syncCaptureConfigToOutput(output, true)
    }, 300)
    return true
  } catch (error) {
    void logError(`[broadcast-ui] enable output '${output.id}' FAILED: ${String(error)}`)
    const title = {
      display: "Could not open display output",
      ndi: "Could not start NDI",
      stream: "Could not go live",
    }[output.type]
    toast.error(title, { description: error instanceof Error ? error.message : String(error) })
    return false
  }
}

/**
 * Take an output off air: stop its NDI sender or stream, and close its
 * window. Stop those first — close_broadcast_window only hides while either
 * is active.
 */
export async function disableOutput(output: BroadcastOutput): Promise<boolean> {
  const store = useBroadcastStore.getState()
  try {
    // Always stop the sender rather than trusting outputStatus: that state is
    // in-memory and only refreshed while the dialog is open, so after a main
    // window reload it can read "inactive" while Rust still holds the session —
    // and close_broadcast_window only hides the window while NDI is live, which
    // would orphan a sender on the network. stop_ndi is a no-op when idle.
    await invoke("stop_ndi", { outputId: output.id })
    await invoke("stop_stream", { outputId: output.id })
    syncCaptureConfigToOutput(output, false)
    await invoke("close_broadcast_window", { outputId: output.id }).catch(() => {})
    store.setOutputStatus(output.id, { previewOpen: false, ndiActive: false, streamActive: false })
    return true
  } catch (error) {
    void logError(`[broadcast-ui] disable output '${output.id}' FAILED: ${String(error)}`)
    toast.error("Could not stop output", { description: String(error) })
    return false
  }
}
