import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { create } from "zustand"
import { toast } from "sonner"
import { useTauriEvent } from "./use-tauri-event"
import type { WhisperModel } from "@/stores/settings-store"

interface WhisperModelStatus {
  installed: boolean
  removable: boolean
  downloading: boolean
  downloaded_bytes: number
  total_bytes: number
}

interface WhisperModelProgress {
  model: WhisperModel
  downloaded_bytes: number
  total_bytes: number
}

type Phase = "unknown" | "missing" | "downloading" | "verifying" | "installed"

interface ModelState {
  phase: Phase
  /** The in-app download (or a partial one) is there to remove. */
  removable: boolean
  downloadedBytes: number
  totalBytes: number
  error: string | null
}

const EMPTY: ModelState = {
  phase: "unknown",
  removable: false,
  downloadedBytes: 0,
  totalBytes: 0,
  error: null,
}

/**
 * Lives outside React so a download keeps its state while Settings is closed
 * and reopened; the backend keeps downloading either way.
 */
const useWhisperModelStore = create<Record<WhisperModel, ModelState>>(() => ({
  accurate: EMPTY,
  fast: EMPTY,
}))

function patch(model: WhisperModel, change: Partial<ModelState>) {
  useWhisperModelStore.setState((s) => ({ [model]: { ...s[model], ...change } }))
}

const CANCELLED = "Download cancelled"

export const whisperModelActions = {
  async refresh(model: WhisperModel): Promise<void> {
    try {
      const status = await invoke<WhisperModelStatus>("whisper_model_status", { model })
      patch(model, {
        phase: status.installed ? "installed" : status.downloading ? "downloading" : "missing",
        removable: status.removable,
        downloadedBytes: status.downloaded_bytes,
        totalBytes: status.total_bytes,
      })
    } catch (e) {
      patch(model, { phase: "missing", error: String(e) })
    }
  },

  async download(model: WhisperModel): Promise<void> {
    patch(model, { phase: "downloading", error: null })
    try {
      await invoke("download_whisper_model", { model })
      patch(model, { phase: "installed" })
      toast.success("Whisper model ready", {
        description: "Local transcription now works offline.",
      })
    } catch (e) {
      const msg = String(e)
      await whisperModelActions.refresh(model)
      if (msg !== CANCELLED) patch(model, { error: msg })
    }
  },

  async cancel(): Promise<void> {
    await invoke("cancel_whisper_model_download")
  },

  async remove(model: WhisperModel): Promise<void> {
    try {
      await invoke("delete_whisper_model", { model })
      patch(model, { error: null })
    } catch (e) {
      patch(model, { error: String(e) })
    }
    await whisperModelActions.refresh(model)
  },
}

export function useWhisperModel(model: WhisperModel) {
  const state = useWhisperModelStore((s) => s[model])

  useEffect(() => {
    void whisperModelActions.refresh(model)
  }, [model])

  useTauriEvent<WhisperModelProgress>("whisper_model_progress", (p) => {
    patch(p.model, {
      // The last bytes are followed by a checksum pass over the whole file.
      phase: p.downloaded_bytes >= p.total_bytes ? "verifying" : "downloading",
      downloadedBytes: p.downloaded_bytes,
      totalBytes: p.total_bytes,
    })
  })

  return {
    ...state,
    download: () => whisperModelActions.download(model),
    cancel: whisperModelActions.cancel,
    remove: () => whisperModelActions.remove(model),
  }
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}
