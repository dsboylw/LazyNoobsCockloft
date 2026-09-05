/** Clipboard helper with an execCommand fallback for non-secure contexts. */

/**
 * Copy text to the clipboard; resolves to false when every path failed.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  if (text === '') return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'true')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
