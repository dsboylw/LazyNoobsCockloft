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
export const NOTE_COLORS = ['default', 'amber', 'rose', 'sky', 'lime'] as const

/** Debounce wait for text edits, ms. */
export const SAVE_DEBOUNCE_MS = 400
