/**
 * Find a network camera again after its address changed: a phone on Wi-Fi
 * gets a new address from the router from day to day, usually in the same
 * subnet. Every other address in the old address's /24 is tried on the same
 * port and path, and the first that answers with an MJPEG stream wins.
 */

/** How long one address gets to answer, in ms. */
const PROBE_TIMEOUT_MS = 1500
/** Addresses tried at once. */
const CONCURRENCY = 24

/** Whether `url` answers with an MJPEG stream. Only the headers are read. */
export async function isMjpegStream(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" })
    const type = response.headers.get("content-type") ?? ""
    return response.ok && /multipart\/x-mixed-replace|image\/jpeg/i.test(type)
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    // Stop the stream: only the headers were wanted.
    controller.abort()
  }
}

/** The addresses to try, nearest to the old one first. */
export function candidateUrls(lastUrl: string): string[] {
  let parsed: URL
  try {
    parsed = new URL(lastUrl)
  } catch {
    return []
  }
  const octets = parsed.hostname.split(".").map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return []
  const last = octets[3]
  const hosts: number[] = []
  for (let d = 1; d < 255; d++) {
    for (const h of [last + d, last - d]) {
      if (h >= 1 && h <= 254 && !hosts.includes(h)) hosts.push(h)
    }
  }
  return hosts.map((h) => {
    const url = new URL(parsed.toString())
    url.hostname = [octets[0], octets[1], octets[2], h].join(".")
    return url.toString()
  })
}

/**
 * The camera's new address, or null if nothing in the subnet answers.
 * `onProgress` gets the share of addresses tried, 0-1.
 */
export async function findCameraAgain(
  lastUrl: string,
  onProgress?: (done: number) => void,
  signal?: AbortSignal
): Promise<string | null> {
  const candidates = candidateUrls(lastUrl)
  let next = 0
  let tried = 0
  let found: string | null = null
  const worker = async () => {
    while (found === null && !signal?.aborted && next < candidates.length) {
      const url = candidates[next++]
      if (await isMjpegStream(url)) found ??= url
      tried += 1
      onProgress?.(tried / candidates.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return found
}
