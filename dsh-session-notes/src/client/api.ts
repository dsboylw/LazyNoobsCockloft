/** Same-origin HTTP face of the session-notes API. */

import type { NoteRecord, NotesSection } from './contract.ts'
import { API_BASE } from './contract.ts'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) throw new Error(`session-notes api ${String(response.status)}`)
  return await response.json() as T
}

export interface SectionResponse {
  ok: boolean
  section: NotesSection
}

export interface NotesResponse {
  ok: boolean
  notes: Record<string, NoteRecord>
}

/** Read the durable section (notes + bar toggle). */
export function fetchSection(): Promise<SectionResponse> {
  return request('/settings')
}

/** Upsert one note. */
export function putNote(id: string, payload: { text?: string; color?: string; pinned?: boolean }): Promise<NotesResponse> {
  return request(`/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/** Remove one note. */
export function deleteNote(id: string): Promise<NotesResponse> {
  return request(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** Toggle the bottom bar. */
export function putBarEnabled(barEnabled: boolean): Promise<SectionResponse> {
  return request('/settings', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ barEnabled }),
  })
}
