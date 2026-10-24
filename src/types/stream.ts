/** Mirrors litdeck_stream::StreamStatus. */
export type DestinationState = "connecting" | "live" | "reconnecting"
export type EncoderState = "starting" | "running" | "restarting"

export interface DestinationStatus {
  id: string
  name: string
  state: DestinationState
  bitrateKbps: number
  retries: number
  error: string | null
}

export interface StreamStatus {
  outputId: string
  encoder: string
  encoderState: EncoderState
  width: number
  height: number
  fps: number
  camera: string | null
  startedAtMs: number
  error: string | null
  destinations: DestinationStatus[]
}

export interface StreamDestinationRequest {
  id: string
  name: string
  url: string
  key: string
}

export interface StreamStartRequest {
  width: number
  height: number
  fps: number
  videoBitrateKbps: number
  audioBitrateKbps: number
  audioDevice: string | null
  audioDelayMs: number
  camera: string | null
  destinations: StreamDestinationRequest[]
}

export interface CameraInfo {
  id: string
  name: string
}

export interface FfmpegInfo {
  path: string
  version: string
  encoder: string | null
  rtmps: boolean
}
