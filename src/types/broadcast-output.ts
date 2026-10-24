import type { NdiAlphaMode, NdiFrameRate, NdiResolution } from "./ndi"

export type BroadcastOutputType = "display" | "ndi" | "stream"

export interface BroadcastOutputNdiSettings {
  sourceName: string
  resolution: NdiResolution
  frameRate: NdiFrameRate
  alphaMode: NdiAlphaMode
}

export type StreamPlatform = "youtube" | "facebook" | "custom"

export interface StreamDestinationSettings {
  id: string
  platform: StreamPlatform
  /** Ingest URL without the key; preset for YouTube and Facebook. */
  url: string
  key: string
  enabled: boolean
}

export interface BroadcastOutputStreamSettings {
  resolution: Exclude<NdiResolution, "r4k">
  frameRate: NdiFrameRate
  videoBitrateKbps: number
  /** Input device name, as listed by get_audio_devices; null streams silence. */
  audioDevice: string | null
  /** Holds the sound back to line up with a camera that lags it. */
  audioDelayMs: number
  /** Camera id from list_stream_cameras; null streams the graphics alone. */
  camera: string | null
  destinations: StreamDestinationSettings[]
}

/**
 * Persisted configuration for one broadcast output. Whether the output is
 * currently on air (window open / NDI sender running) is runtime state,
 * reconciled from the OS — never persisted.
 */
export interface BroadcastOutput {
  /** "main" for the default output; crypto.randomUUID() otherwise. */
  id: string
  name: string
  type: BroadcastOutputType
  themeId: string
  /** Kept even while type === "ndi" so switching types is lossless. */
  monitorIndex: number
  ndi: BroadcastOutputNdiSettings
  /** Kept whatever the type, like `ndi`. Missing on outputs saved before streaming. */
  stream: BroadcastOutputStreamSettings
}

/** Runtime on-air state for an output, reconciled from the OS. */
export interface BroadcastOutputStatus {
  previewOpen: boolean
  ndiActive: boolean
  streamActive: boolean
}

/** Whether an output is putting a picture out right now. */
export const isOnAir = (output: BroadcastOutput, status: BroadcastOutputStatus | undefined): boolean => {
  if (!status) return false
  if (output.type === "display") return status.previewOpen
  if (output.type === "ndi") return status.ndiActive
  return status.streamActive
}

/** The default output: always present, editable, never deletable. */
export const MAIN_OUTPUT_ID = "main"

export const outputWindowLabel = (id: string) => `broadcast-${id}`

export const defaultNdiSettings = (sourceName = "Litdeck"): BroadcastOutputNdiSettings => ({
  sourceName,
  resolution: "r1080p",
  frameRate: "fps24",
  alphaMode: "straightAlpha",
})

export const STREAM_PLATFORM_URLS: Record<Exclude<StreamPlatform, "custom">, string> = {
  youtube: "rtmps://a.rtmp.youtube.com/live2",
  facebook: "rtmps://live-api-s.facebook.com:443/rtmp",
}

export const newStreamDestination = (platform: StreamPlatform = "youtube"): StreamDestinationSettings => ({
  id: crypto.randomUUID(),
  platform,
  url: platform === "custom" ? "" : STREAM_PLATFORM_URLS[platform],
  key: "",
  enabled: true,
})

export const defaultStreamSettings = (): BroadcastOutputStreamSettings => ({
  resolution: "r1080p",
  frameRate: "fps30",
  videoBitrateKbps: 4500,
  audioDevice: null,
  audioDelayMs: 0,
  camera: null,
  destinations: [newStreamDestination("youtube")],
})

/** Fill in settings added since the output was saved. */
export const normalizeOutput = (output: BroadcastOutput): BroadcastOutput => ({
  ...output,
  stream: { ...defaultStreamSettings(), ...output.stream },
})
