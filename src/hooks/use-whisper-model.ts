import { useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { create } from "zustand"
import { toast } from "sonner"
import { useTauriEvent } from "./use-tauri-event"

interface WhisperModelStatus {
  installed: boolean
  downloading: boolean
  downloaded_bytes: number
  total_bytes: number
}

interface WhisperModelProgress {
  downloaded_bytes: number
  total_bytes: number
}

type Phase = "unknown" | "missing" | "downloading" | "verifying" | "installed"

interface WhisperModelState {
  phase: Phase
  downloadedBytes: number
  totalBytes: number
  error: string | null
}

/**
 * Lives outside React so a download keeps its state while Settings is closed
 * and reopened; the backend keeps downloading either way.
 */
const useWhisperModelStore = create<WhisperModelState>(() => ({
  phase: "unknown",
  downloadedBytes: 0,
  totalBytes: 0,
  error: null,
}))

const CANCELLED = "Download cancelled"

export const whisperModelActions = {
  async refresh(): Promise<void> {
    try {
      const status = await invoke<WhisperModelStatus>("whisper_model_status")
      useWhisperModelStore.setState({
        phase: status.installed
          ? "installed"
          : status.downloading
            ? "downloading"
            : "missing",
        downloadedBytes: status.downloaded_bytes,
        totalBytes: status.total_bytes,
      })
    } catch (e) {
      useWhisperModelStore.setState({ phase: "missing", error: String(e) })
    }
  },

  async download(): Promise<void> {
    useWhisperModelStore.setState({ phase: "downloading", error: null })
    try {
      await invoke("download_whisper_model")
      useWhisperModelStore.setState({ phase: "installed" })
      toast.success("Whisper model ready", {
        description: "Local transcription now works offline.",
      })
    } catch (e) {
      const msg = String(e)
      await whisperModelActions.refresh()
      if (msg !== CANCELLED) {
        useWhisperModelStore.setState({ error: msg })
      }
    }
  },

  async cancel(): Promise<void> {
    await invoke("cancel_whisper_model_download")
  },
}

export function useWhisperModel() {
  const state = useWhisperModelStore()

  useEffect(() => {
    void whisperModelActions.refresh()
  }, [])

  useTauriEvent<WhisperModelProgress>("whisper_model_progress", (p) => {
    useWhisperModelStore.setState({
      // The last bytes are followed by a checksum pass over the whole file.
      phase: p.downloaded_bytes >= p.total_bytes ? "verifying" : "downloading",
      downloadedBytes: p.downloaded_bytes,
      totalBytes: p.total_bytes,
    })
  })

  return { ...state, ...whisperModelActions }
}

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}
