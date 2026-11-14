/** How a camera in use is doing, as the app's `camera_health` command reports it. */
export interface CameraHealth {
  url: string
  state: "connecting" | "live" | "stalled" | "down"
  problem: string | null
  width: number | null
  height: number | null
  kbps: number
  readers: number
}

/** Worst first: the navbar dot shows the worst camera. */
const SEVERITY: Record<CameraHealth["state"], number> = { down: 3, stalled: 2, connecting: 1, live: 0 }

/** The worst state among `cameras`, or null when none are in use. */
export function worstState(cameras: CameraHealth[]): CameraHealth["state"] | null {
  return cameras.reduce<CameraHealth["state"] | null>(
    (worst, c) => (worst === null || SEVERITY[c.state] > SEVERITY[worst] ? c.state : worst),
    null
  )
}

