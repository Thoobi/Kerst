import { describe, expect, it } from "vitest"
import { isTypingOrHandled } from "./operator-keys"

const key = (overrides: Partial<Parameters<typeof isTypingOrHandled>[0]> = {}) => ({
  target: null,
  defaultPrevented: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...overrides,
})

describe("isTypingOrHandled", () => {
  it("lets a plain key through to the panel", () => {
    expect(isTypingOrHandled(key())).toBe(false)
  })

  it("leaves keys a menu already handled, and modifier shortcuts, alone", () => {
    expect(isTypingOrHandled(key({ defaultPrevented: true }))).toBe(true)
    expect(isTypingOrHandled(key({ ctrlKey: true }))).toBe(true)
    expect(isTypingOrHandled(key({ metaKey: true }))).toBe(true)
    expect(isTypingOrHandled(key({ altKey: true }))).toBe(true)
  })
})
