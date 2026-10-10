/**
 * Whether a key press belongs to something else, so a panel's stepping
 * shortcuts must leave it alone: typing in a field, a key a menu or list
 * already handled (Radix marks those with preventDefault), or a shortcut
 * with a modifier.
 */
export function isTypingOrHandled(event: {
  target: EventTarget | null
  defaultPrevented: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true
  const target = event.target
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    target.closest('[role="listbox"], [role="menu"], [role="dialog"]') !== null
  )
}
