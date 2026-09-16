/**
 * Notes UI: the header popover (session-notes manager + all-notes list + bar
 * toggle) and the bottom persistent bar for the current session.
 * Copy surfaces: the editor, every list row, and the bottom bar (direct copy
 * when 1 note, a picker when several). Popover open state lives in the shared
 * store so the bar can open it too.
 */

import { useEffect, useState } from 'react'
import type { SnapshotSelectorHook } from './store.ts'
import type { NoteRecord, NotesSection } from './contract.ts'
import { NOTE_COLORS, previewText } from './contract.ts'
import { copyText } from './clipboard.ts'
import { ensureStyles } from './styles.ts'

/** Locale-safe translate wrapper: the shell's t() may return undefined for keys
 * it did not register (0.3.x added keys on a running shell) — never let that
 * crash the render tree. Falls back to the key itself. */
export function tt(t: (key: string) => string): (key: string) => string {
  return (key) => {
    try {
      const v = t(key)
      return typeof v === 'string' ? v : key
    } catch {
      return key
    }
  }
}

/** Overview row: characters shown for the session title before an ellipsis. */
const ROW_TITLE_CHARS = 20
/** Overview row: characters shown for the workspace name before an ellipsis. */
const ROW_WORKSPACE_CHARS = 10

/** Popover anchor (viewport coords of the trigger button). */
export interface PopoverAnchor {
  left: number
  top: number
  height: number
}

/** Session list row projected from the sessions store. */
export interface SessionRow {
  id: string
  title: string
  /** Owning workspace display name, when the workspaces service reports one. */
  workspace?: string
}

/** Props shared by both surfaces. */
export interface NotesUiProps {
  /** Current session id (undefined on the blank/new-session screen). */
  sessionId: string | undefined
  /** Bound selector hook over the notes store (section + popover state). */
  useNotes: SnapshotSelectorHook<NotesState>
  /** Upsert one note; resolves to false on failure. 0.3.0 payload may carry sessionId. */
  saveNote: (id: string, payload: { text?: string; color?: string; pinned?: boolean; sessionId?: string }) => Promise<boolean>
  /** Create a note for a session with a fresh id; resolves to false on failure. */
  addNote: (sessionId: string, text: string, color: string) => Promise<boolean>
  /** 0.3.2: paint every note of the session with one color. */
  recolorNote: (sessionId: string, color: string) => Promise<boolean>
  /** 0.3.2: toggle the session-level pin (all notes of the session). */
  pinSession: (sessionId: string, pinned: boolean) => Promise<boolean>
  /** Select which note of the current session the editor binds to (0.3.0). */
  selectNote: (id: string | undefined) => void
  /** Toggle the bottom-bar copy picker (0.3.0). */
  setPickerOpen: (open: boolean) => void
  /** Remove one note; resolves to false on failure. */
  removeNote: (id: string) => Promise<boolean>
  /** Toggle the bottom bar; resolves to false on failure. */
  saveBarEnabled: (barEnabled: boolean) => Promise<boolean>
  /** Open the popover anchored at a trigger rect; source says which surface owns it. */
  openPopover: (anchor: PopoverAnchor, source?: 'header' | 'bar') => void
  /** Close the popover. */
  closePopover: () => void
  /** Open a session by id (overview jump). */
  openSession: (id: string) => void
  /** Projected session rows for title lookup (computed by the entry). */
  rows: SessionRow[]
  /** Locale translate fn. */
  t: (key: string) => string
}

/** Full client store state. */
export interface NotesState extends NotesSection {
  /** Whichever surface opened the popover renders it — one popover at a time. */
  popover: { open: boolean; anchor: PopoverAnchor | null; source?: 'header' | 'bar' }
  /** Which note (of the current session) the popover editor is bound to. */
  selectedNoteId?: string
  /** Copy-picker open state for the bottom bar (multi-note sessions). */
  pickerOpen: boolean
}

/** Tiny flash-state helper for transient feedback. */
function useFlash(ms = 1500): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const [timer, setTimer] = useState<number | undefined>(undefined)
  useEffect(() => () => { if (timer !== undefined) window.clearTimeout(timer) }, [])
  const fire = (): void => {
    setOn(true)
    if (timer !== undefined) window.clearTimeout(timer)
    setTimer(window.setTimeout(() => { setOn(false) }, ms))
  }
  return [on, fire]
}

/** Copy button with a transient "copied" state. */
function CopyButton(props: { text: string; label: string; copiedLabel: string; mini?: boolean }): JSX.Element {
  const [copied, flash] = useFlash()
  const cls = copied ? 'snotes-mini ok' : props.mini === true ? 'snotes-btn snotes-mini' : 'snotes-btn'
  return (
    <button
      type="button"
      className={cls}
      onClick={(e) => {
        e.stopPropagation()
        void copyText(props.text).then((ok) => { if (ok) flash() })
      }}
    >
      {copied ? props.copiedLabel : props.label}
    </button>
  )
}

/** Notes of one session, in stable seq order (1, 2, 3… by creation). */
function notesOfSession(notes: Record<string, NoteRecord>, sessionId: string | undefined): NoteRecord[] {
  return Object.values(notes)
    .filter((n) => sessionId !== undefined && n.sessionId === sessionId)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.id.localeCompare(b.id))
}

/** Latest note of a session (by updated), or undefined. */
function latestOfSession(notes: Record<string, NoteRecord>, sessionId: string): NoteRecord | undefined {
  return Object.values(notes)
    .filter((n) => n.sessionId === sessionId)
    .sort((a, b) => b.updated - a.updated)[0]
}

/** Compute popover placement (opens below the anchor, flips above near the bottom edge). */
function popoverStyle(anchor: PopoverAnchor): React.CSSProperties {
  const left = Math.max(12, Math.min(anchor.left - 40, window.innerWidth - 660))
  const below = window.innerHeight - (anchor.top + anchor.height)
  if (below < 360) {
    return { left, bottom: Math.max(12, window.innerHeight - anchor.top + 8) }
  }
  return { left, top: anchor.top + anchor.height + 8 }
}

/** Edit popover: session-notes manager (multi-note) + all-notes list + bar toggle. */
export function NotesPopover(props: NotesUiProps): JSX.Element | null {
  const { sessionId, useNotes, saveNote, addNote, recolorNote, pinSession, selectNote, removeNote, saveBarEnabled, openPopover, closePopover, openSession, rows } = props
  const t = tt(props.t)
  ensureStyles()
  const state = useNotes((s) => s)
  const anchor = state.popover.anchor
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')

  const sessionNotes = notesOfSession(state.notes, sessionId)
  // Session color/pin are SESSION-level attributes (uniform across its notes —
  // kept uniform by recolorNote/pinSession; the first note is the source of truth).
  const sessionColor = sessionNotes[0]?.color ?? 'default'
  const sessionPinned = sessionNotes.length > 0 && sessionNotes.every((n) => n.pinned === true)
  const selectedId = state.selectedNoteId !== undefined && state.notes[state.selectedNoteId]?.sessionId === sessionId
    ? state.selectedNoteId
    : sessionNotes[0]?.id
  const selected: NoteRecord | undefined = selectedId !== undefined ? state.notes[selectedId] : undefined

  // Load the selected note into the editor when the session or selection changes.
  // No flush needed: edits save immediately (no pending state to lose).
  useEffect(() => {
    setDraft(selected?.text ?? '')
    setStatus('')
  }, [sessionId, selectedId])

  // Click-outside closes — but clicks inside the popover or on the trigger
  // button must NOT close it (mousedown bubbles from inner fields too).
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Element | null
      if (target !== null && typeof target.closest === 'function') {
        if (target.closest('.snotes-pop') !== null) return
        if (target.closest('.snotes-trigger') !== null) return
      }
      closePopover()
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') closePopover() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [closePopover])

  if (!state.popover.open || anchor === null) return null

  const flashStatus = (ok: boolean): void => {
    setStatus(ok ? t('edit.saved') : t('error.save'))
    window.setTimeout(() => setStatus(''), 1500)
  }

  const persist = (text: string): void => {
    if (selectedId === undefined) return
    void saveNote(selectedId, { text }).then((ok) => { flashStatus(ok) })
  }

  const count = sessionNotes.length
  // Group notes by session once for the cross-session lists below.
  const bySession = new Map<string, NoteRecord[]>()
  for (const n of Object.values(state.notes)) {
    const list = bySession.get(n.sessionId) ?? []
    list.push(n)
    bySession.set(n.sessionId, list)
  }
  for (const list of bySession.values()) list.sort((a, b) => b.updated - a.updated)

  // Cross-session jump list: sessions that actually have notes.
  const rowsWithNotes = (rows ?? []).filter((row) => (bySession.get(row.id)?.length ?? 0) > 0)
  const q = query.trim().toLowerCase()
  const visibleRows = rowsWithNotes
    .filter((row) => {
      if (q === '') return true
      const latest = bySession.get(row.id)?.[0]
      return row.title.toLowerCase().includes(q) || (row.workspace ?? '').toLowerCase().includes(q) || (latest?.text ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const pa = bySession.get(a.id)?.some((n) => n.pinned === true) ?? false
      const pb = bySession.get(b.id)?.some((n) => n.pinned === true) ?? false
      if (pa !== pb) return pa ? -1 : 1
      return (bySession.get(b.id)?.[0]?.updated ?? 0) - (bySession.get(a.id)?.[0]?.updated ?? 0)
    })

  const newNote = (): void => {
    if (sessionId === undefined) return
    void addNote(sessionId, '', sessionColor).then((ok) => {
      if (!ok) flashStatus(false)
    })
  }

  const deleteSessionNotes = (rowId: string): void => {
    for (const n of bySession.get(rowId) ?? []) void removeNote(n.id)
  }

  return (
    <div className="snotes-pop" style={popoverStyle(anchor)} onClick={(e) => e.stopPropagation()}>
      <div className="snotes-title-row">
        <h3 style={{ flex: 'none', margin: 0 }}>{t('edit.title')}{count > 0 ? ` ${t('edit.count').replace('{n}', String(count))}` : ''}</h3>
        {count > 0 && (
          <div className="snotes-colors" style={{ margin: '0 6px' }}>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                className={`snotes-dot ${c}${sessionColor === c ? ' sel' : ''}`}
                onClick={() => { if (sessionId !== undefined) void recolorNote(sessionId, c).then((ok) => { flashStatus(ok) }) }}
              />
            ))}
          </div>
        )}
        {count > 0 && (
          <button
            type="button"
            className="snotes-btn"
            style={sessionPinned ? { background: '#d29922', borderColor: '#d29922', color: '#1f2328', fontWeight: 600 } : undefined}
            title={sessionPinned ? t('edit.unpin') : t('edit.pin')}
            onClick={() => { if (sessionId !== undefined) void pinSession(sessionId, !sessionPinned).then((ok) => { flashStatus(ok) }) }}
          >
            {sessionPinned ? `📌 ${t('edit.unpin')}` : `📌 ${t('edit.pin')}`}
          </button>
        )}
      </div>
      {count > 0 && (
        <div className="snotes-list snotes-session-list">
          {sessionNotes.map((n) => (
            <div
              key={n.id}
              role="button"
              tabIndex={0}
              className={`snotes-item${n.id === selectedId ? ' snotes-item-sel' : ''}`}
              onClick={() => { selectNote(n.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { selectNote(n.id) } }}
            >
              <span className="snotes-item-seq">{n.seq ?? '·'}</span>
              <span className="snotes-item-text">
                <span className="snotes-item-title">{previewText(n.text, 36)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {count === 0 && (
        <div style={{ opacity: 0.6, fontSize: 13, margin: '4px 0 8px' }}>{t('bar.picker.empty')}</div>
      )}
      <div className="snotes-row">
        <textarea
          className="snotes-text"
          value={draft}
          placeholder={sessionId === undefined ? t('edit.placeholder') : (selected === undefined ? t('bar.picker.empty') : t('edit.placeholder'))}
          onChange={(e) => {
            setDraft(e.target.value)
            persist(e.target.value)
          }}
        />
        <div className="snotes-col">
          <CopyButton
            text={selected?.text ?? ''}
            label={t('edit.copy')}
            copiedLabel={t('edit.copied')}
          />
          <button
            type="button"
            className="snotes-btn"
            disabled={sessionId === undefined}
            onClick={newNote}
          >
            {t('edit.new')}
          </button>
          <button
            type="button"
            className="snotes-btn danger"
            disabled={selected === undefined}
            onClick={() => {
              if (selectedId === undefined || selected === undefined) return
              setDraft('')
              void removeNote(selectedId)
            }}
          >
            {t('edit.delete')}
          </button>
        </div>
      </div>
      <hr className="snotes-divider" />
      <h3>{t('all.title')}</h3>
      {rowsWithNotes.length > 0 && (
        <input
          className="snotes-filter"
          type="text"
          value={query}
          placeholder={t('all.filter')}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="snotes-list">
        {rowsWithNotes.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>{t('all.empty')}</div>}
        {rowsWithNotes.length > 0 && visibleRows.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>{t('all.noMatch')}</div>}
        {visibleRows.map((row) => {
          const latest = bySession.get(row.id)?.[0]
          if (latest === undefined) return null
          const isCurrent = row.id === sessionId
          const title = row.title.length > ROW_TITLE_CHARS ? `${row.title.slice(0, ROW_TITLE_CHARS)}…` : row.title
          const workspace = row.workspace === undefined ? undefined : (row.workspace.length > ROW_WORKSPACE_CHARS ? `${row.workspace.slice(0, ROW_WORKSPACE_CHARS)}…` : row.workspace)
          const hover = row.workspace === undefined ? `${row.title} — ${latest.text}` : `${row.workspace} / ${row.title} — ${latest.text}`
          const pinned = latest.pinned === true
          return (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              className="snotes-item"
              title={hover}
              onClick={() => { closePopover(); if (!isCurrent) openSession(row.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { closePopover(); if (!isCurrent) openSession(row.id) } }}
            >
              <span className={`snotes-flag ${latest.color}`} />
              <span className="snotes-item-text">
                {workspace !== undefined && <span className="snotes-item-workspace">{workspace}</span>}
                <span className="snotes-item-title">{pinned ? '📌 ' : ''}{title}{isCurrent ? ` · ${t('all.current')}` : ''}</span>
              </span>
              <button
                type="button"
                className={`snotes-pin${pinned ? ' on' : ''}`}
                title={pinned ? t('edit.unpin') : t('edit.pin')}
                onClick={(e) => { e.stopPropagation(); void saveNote(latest.id, { pinned: !pinned }) }}
              >
                📌
              </button>
              <CopyButton
                text={latest.text}
                label={t('edit.copy')}
                copiedLabel={t('edit.copied')}
                mini
              />
              <button
                type="button"
                className="snotes-mini snotes-danger"
                title={t('all.deleteAll')}
                onClick={(e) => { e.stopPropagation(); deleteSessionNotes(row.id) }}
              >
                🗑
              </button>
            </div>
          )
        })}
      </div>
      <label className="snotes-switch">
        <input
          type="checkbox"
          checked={state.barEnabled}
          onChange={(e) => { void saveBarEnabled(e.target.checked) }}
        />
        {t('bar.toggle')}
      </label>
    </div>
  )
}

/** Bottom persistent bar: latest-note preview + count badge + copy picker. */
export function NotesBar(props: NotesUiProps): JSX.Element | null {
  const { sessionId, useNotes, openPopover, selectNote, setPickerOpen } = props
  const t = tt(props.t)
  ensureStyles()
  const state = useNotes((s) => s)
  if (sessionId === undefined) return null
  const sessionNotes = notesOfSession(state.notes, sessionId)
  if (sessionNotes.length === 0) {
    return (
      <div className="snotes-bar">
        <strong style={{ flex: 'none' }}>{t('bar.label')}</strong>
        <span
          className="snotes-bar-text"
          style={{ opacity: 0.55 }}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            openPopover({ left: rect.left, top: rect.top, height: rect.height })
          }}
        >
          {t('bar.empty')}
        </span>
      </div>
    )
  }
  const latest = sessionNotes[sessionNotes.length - 1]
  const count = sessionNotes.length
  const preview = previewText(latest.text, BAR_PREVIEW)
  return (
    <div className="snotes-bar snotes-trigger">
      <span className={`snotes-flag ${latest.color}`} />
      <strong style={{ flex: 'none' }}>{t('bar.label')}</strong>
      <span
        className="snotes-bar-text"
        title={latest.text}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          selectNote(latest.id)
          openPopover({ left: rect.left, top: rect.top, height: rect.height })
        }}
      >
        {preview}
      </span>
      {count > 1 && <span className="snotes-badge" title={t('edit.count').replace('{n}', String(count))}>×{count}</span>}
      {count === 1 ? (
        <button
          type="button"
          className="snotes-mini"
          onClick={(e) => { e.stopPropagation(); void copyText(latest.text) }}
        >
          {t('edit.copy')}
        </button>
      ) : (
        <span className="snotes-picker-host">
          <button
            type="button"
            className="snotes-mini"
            onClick={(e) => { e.stopPropagation(); setPickerOpen(!state.pickerOpen) }}
          >
            {t('edit.copy')} ▾
          </button>
          {state.pickerOpen && (
            <div className="snotes-pop snotes-picker" onClick={(e) => e.stopPropagation()}>
              <h3>{t('bar.picker')}</h3>
              <div className="snotes-list">
                {sessionNotes.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="snotes-item"
                    title={n.text}
                    onClick={(e) => {
                      e.stopPropagation()
                      void copyText(n.text)
                      setPickerOpen(false)
                    }}
                  >
                    <span className={`snotes-flag ${n.color}`} />
                    <span className="snotes-item-text">
                      <span className="snotes-item-title">{n.seq !== undefined ? `${n.seq}. ` : ''}{previewText(n.text, 32)}</span>
                    </span>
                    <span className="snotes-mini">{t('edit.copy')}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </span>
      )}
    </div>
  )
}

/** Characters shown for the bar preview before an ellipsis. */
const BAR_PREVIEW = 20
