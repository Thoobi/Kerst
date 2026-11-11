import { describe, expect, it } from "vitest"
import { MjpegParser, decodeInterval, normaliseCameraUrl } from "./mjpeg-reader"
import { candidateUrls } from "./camera-discovery"

const enc = new TextEncoder()

function jpeg(...body: number[]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...body, 0xff, 0xd9])
}

function part(frame: Uint8Array, withLength = true): Uint8Array {
  const headers = enc.encode(
    `--boundary\r\nContent-Type: image/jpeg\r\n${withLength ? `Content-Length: ${frame.length}\r\n` : ""}\r\n`
  )
  const out = new Uint8Array(headers.length + frame.length + 2)
  out.set(headers)
  out.set(frame, headers.length)
  out.set(enc.encode("\r\n"), headers.length + frame.length)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe("MjpegParser", () => {
  it("splits a stream into its JPEGs, across any chunking", () => {
    const a = jpeg(1, 2, 3)
    const b = jpeg(4, 5)
    const stream = concat(part(a), part(b))
    for (const size of [1, 3, 7, stream.length]) {
      const parser = new MjpegParser()
      const frames: Uint8Array[] = []
      for (let i = 0; i < stream.length; i += size) frames.push(...parser.push(stream.slice(i, i + size)))
      expect(frames).toEqual([a, b])
    }
  })

  it("uses Content-Length so an embedded end marker doesn't cut the picture short", () => {
    // A thumbnail inside the JPEG has its own end marker.
    const frame = jpeg(1, 0xff, 0xd9, 2)
    expect(new MjpegParser().push(part(frame))).toEqual([frame])
  })

  it("falls back to the end marker without Content-Length", () => {
    const frame = jpeg(9, 9)
    expect(new MjpegParser().push(part(frame, false))).toEqual([frame])
  })
})

describe("normaliseCameraUrl", () => {
  it("takes just an IP, as IP Webcam shows it", () => {
    expect(normaliseCameraUrl("10.125.43.51")).toBe("http://10.125.43.51:8080/video")
    expect(normaliseCameraUrl(" 10.125.43.51:4747 ")).toBe("http://10.125.43.51:4747/video")
    expect(normaliseCameraUrl("http://10.125.43.51:8080")).toBe("http://10.125.43.51:8080/video")
  })

  it("keeps a full address as it is", () => {
    expect(normaliseCameraUrl("http://cam.local/mjpg/video.mjpg")).toBe("http://cam.local/mjpg/video.mjpg")
    expect(normaliseCameraUrl("")).toBe("")
  })
})

describe("candidateUrls", () => {
  it("tries the rest of the /24 on the same port and path, nearest first", () => {
    const urls = candidateUrls("http://10.125.43.51:8080/video")
    expect(urls).toHaveLength(253)
    expect(urls.slice(0, 2)).toEqual(["http://10.125.43.52:8080/video", "http://10.125.43.50:8080/video"])
    expect(urls).not.toContain("http://10.125.43.51:8080/video")
  })

  it("has nothing to try for a host name", () => {
    expect(candidateUrls("http://cam.local/video")).toEqual([])
  })
})

describe("cameraRelayUrl", () => {
  it("goes through the media server's camera route", async () => {
    const { cameraRelayUrl } = await import("./mjpeg-reader")
    expect(cameraRelayUrl("http://127.0.0.1:5000/tok/videos", "http://10.0.0.5:8080/video")).toBe(
      "http://127.0.0.1:5000/tok/camera?url=http%3A%2F%2F10.0.0.5%3A8080%2Fvideo"
    )
    expect(cameraRelayUrl(null, "http://10.0.0.5:8080/video")).toBe("http://10.0.0.5:8080/video")
  })
})

describe("decodeInterval", () => {
  it("decodes up to 30 pictures a second when decoding is cheap", () => {
    expect(decodeInterval(0)).toBeCloseTo(1000 / 30)
    expect(decodeInterval(5)).toBeCloseTo(1000 / 30)
  })

  it("spaces decodes out when they are expensive, so they take about a third of the time", () => {
    // A 1080p picture on a dual-core laptop: ~25ms, so ~14 a second, not 26.
    expect(decodeInterval(25)).toBeCloseTo(25 / 0.35)
    expect(1000 / decodeInterval(25)).toBeLessThan(15)
  })
})
