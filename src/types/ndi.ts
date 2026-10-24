export type NdiResolution = "r720p" | "r1080p" | "r4k"
export type NdiFrameRate = "fps24" | "fps30" | "fps60"
export type NdiAlphaMode = "noneOpaque" | "straightAlpha" | "premultipliedAlpha"

export interface NdiStartRequest {
  sourceName: string
  resolution: NdiResolution
  frameRate: NdiFrameRate
  alphaMode: NdiAlphaMode
}

export interface NdiSessionInfo {
  sourceName: string
  resolution: NdiResolution
  frameRate: NdiFrameRate
  alphaMode: NdiAlphaMode
  width: number
  height: number
  fps: number
}

/** How an output window should capture frames for NDI and/or a stream. */
export interface CaptureConfigEventPayload {
  active: boolean
  fps: number
  width: number
  height: number
}
