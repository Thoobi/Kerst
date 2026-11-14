import { describe, expect, it } from "vitest"
import { worstState, type CameraHealth } from "./camera-health"

const camera = (state: CameraHealth["state"]): CameraHealth => ({
  url: `http://cam/${state}`,
  state,
  problem: null,
  width: null,
  height: null,
  kbps: 0,
  readers: 1,
})

describe("worstState", () => {
  it("is nothing with no camera in use", () => {
    expect(worstState([])).toBeNull()
  })

  it("shows the worst camera: down, then stalled, then connecting, then live", () => {
    expect(worstState([camera("live"), camera("live")])).toBe("live")
    expect(worstState([camera("live"), camera("connecting")])).toBe("connecting")
    expect(worstState([camera("stalled"), camera("connecting"), camera("live")])).toBe("stalled")
    expect(worstState([camera("live"), camera("down"), camera("stalled")])).toBe("down")
  })
})
