/** Shared types + constants for the notes client. */

/** One note record (mirrors the host-side sanitize shape). */
export interface NoteRecord {
  id: string
  text: string
  color: string
  pinned: boolean
  updated: number
}

/** Durable section shape. */
export interface NotesSection {
  notes: Record<string, NoteRecord>
  barEnabled: boolean
}

export const API_BASE = '/plugins/dsh-session-notes/api'

/** Accent color choices (keys map to CSS classes). */
export const NOTE_COLORS = ['default', 'amber', 'rose', 'sky', 'lime', 'purple', 'pink', 'orange', 'teal', 'blue'] as const

/** Hex values for the accent colors — single source of truth; keep in sync with the .snotes-dot/.snotes-flag classes in styles.ts. */
export const NOTE_COLOR_HEX: Record<string, string> = {
  default: '#8a8f98',
  amber: '#d29922',
  rose: '#e5534b',
  sky: '#539bf5',
  lime: '#57ab5a',
  purple: '#986ee2',
  pink: '#e5539b',
  orange: '#bc4c00',
  teal: '#39c5cf',
  blue: '#1f6feb',
}

/** Hex for an accent color key, with the lime green used before 0.1.x as fallback. */
export function noteColorHex(color: string | undefined): string {
  return (color !== undefined && NOTE_COLOR_HEX[color]) || '#57ab5a'
}

/** Pick dark or light label color readable on the given background hex. */
export function textColorOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (m === null) return '#fff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1f2328' : '#fff'
}

/** Debounce wait for text edits, ms. */
export const SAVE_DEBOUNCE_MS = 400
