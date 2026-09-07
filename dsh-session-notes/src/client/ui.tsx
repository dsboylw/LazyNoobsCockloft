/**
 * Notes UI: the header popover (edit current session note + all-notes list +
 * bar toggle) and the bottom persistent bar for the current session.
 * Copy buttons appear on the editor, every list row, and the bar.
 * Popover open state lives in the shared store so the bar can open it too.
 */

import { useEffect, useRef, useState } from 'react'
import type { SnapshotSelectorHook } from './store.ts'
import type { NoteRecord, NotesSection } from './contract.ts'
import { NOTE_COLORS, SAVE_DEBOUNCE_MS } from './contract.ts'
import { copyText } from './clipboard.ts'
import { ensureStyles } from './styles.ts'

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
  /** Upsert one note; resolves to false on failure. */
  saveNote: (id: string, payload: { text?: string; color?: string; pinned?: boolean }) => Promise<boolean>
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
}

/** Tiny flash-state helper for transient feedback. */
function useFlash(ms = 1500): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => { if (timer.current !== undefined) window.clearTimeout(timer.current) }, [])
  const fire = (): void => {
    setOn(true)
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { setOn(false) }, ms)
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

/** Sort notes: pinned first, then by updated desc. */
function sortEntries(notes: Record<string, NoteRecord>): Array<[string, NoteRecord]> {
  return Object.entries(notes).sort((a, b) => {
    if (a[1].pinned !== b[1].pinned) return a[1].pinned ? -1 : 1
    return b[1].updated - a[1].updated
  })
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

/** Edit popover: current note editor + all-notes list + bar toggle. */
export function NotesPopover(props: NotesUiProps): JSX.Element | null {
  const { sessionId, useNotes, saveNote, removeNote, saveBarEnabled, openPopover, closePopover, openSession, rows, t } = props
  ensureStyles()
  const state = useNotes((s) => s)
  const anchor = state.popover.anchor
  const [draft, setDraft] = useState('')
  const [color, setColor] = useState('default')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const debounce = useRef<number | undefined>(undefined)
  const latest = useRef<{ id: string | undefined; text: string; color: string }>({ id: undefined, text: '', color: 'default' })

  // Load the current note into the editor when the session changes.
  useEffect(() => {
    if (debounce.current !== undefined) window.clearTimeout(debounce.current)
    const note = sessionId === undefined ? undefined : state.notes[sessionId]
    setDraft(note?.text ?? '')
    setColor(note?.color ?? 'default')
    setStatus('')
    latest.current = { id: sessionId, text: note?.text ?? '', color: note?.color ?? 'default' }
  }, [sessionId])

  // Flush pending edits when the popover unmounts.
  useEffect(() => () => {
    if (debounce.current !== undefined) window.clearTimeout(debounce.current)
    const { id, text, color: c } = latest.current
    if (id !== undefined && text !== '') void saveNote(id, { text, color: c })
  }, [])

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

  const persist = (text: string, nextColor: string): void => {
    if (sessionId === undefined) return
    latest.current = { id: sessionId, text, color: nextColor }
    if (debounce.current !== undefined) window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      debounce.current = undefined
      void saveNote(sessionId, { text, color: nextColor }).then((ok) => {
        setStatus(ok ? t('edit.saved') : t('error.save'))
        window.setTimeout(() => setStatus(''), 1500)
      })
    }, SAVE_DEBOUNCE_MS)
  }

  const currentNote: NoteRecord | undefined = sessionId === undefined ? undefined : state.notes[sessionId]
  // Include the current session (when it has a note) so it can be pinned from
  // the list too; clicking it just closes the popover — nowhere to jump.
  const rowsWithNotes = rows.filter((row) => (row.id !== sessionId || currentNote !== undefined) && state.notes[row.id] !== undefined)
  const q = query.trim().toLowerCase()
  const visibleRows = rowsWithNotes
    .filter((row) => {
      if (q === '') return true
      const n = state.notes[row.id]
      return row.title.toLowerCase().includes(q) || (row.workspace ?? '').toLowerCase().includes(q) || (n?.text ?? '').toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const pa = state.notes[a.id]?.pinned === true
      const pb = state.notes[b.id]?.pinned === true
      if (pa !== pb) return pa ? -1 : 1
      return (state.notes[b.id]?.updated ?? 0) - (state.notes[a.id]?.updated ?? 0)
    })

  return (
    <div className="snotes-pop" style={popoverStyle(anchor)} onClick={(e) => e.stopPropagation()}>
      <h3>{t('edit.title')}</h3>
      <div className="snotes-row">
        <textarea
          className="snotes-text"
          value={draft}
          placeholder={t('edit.placeholder')}
          onChange={(e) => {
            setDraft(e.target.value)
            persist(e.target.value, color)
          }}
        />
        <div className="snotes-col">
          <CopyButton
            text={currentNote?.text ?? ''}
            label={t('edit.copy')}
            copiedLabel={t('edit.copied')}
          />
          {currentNote !== undefined && (
            <button
              type="button"
              className="snotes-btn"
              style={currentNote.pinned === true ? { background: '#d29922', borderColor: '#d29922', color: '#1f2328', fontWeight: 600 } : undefined}
              title={currentNote.pinned === true ? t('edit.unpin') : t('edit.pin')}
              onClick={() => { if (sessionId !== undefined) void saveNote(sessionId, { pinned: currentNote.pinned !== true }) }}
            >
              {currentNote.pinned === true ? `📌 ${t('edit.unpin')}` : `📌 ${t('edit.pin')}`}
            </button>
          )}
          <button
            type="button"
            className="snotes-btn danger"
            disabled={currentNote === undefined}
            onClick={() => {
              if (sessionId === undefined || currentNote === undefined) return
              if (debounce.current !== undefined) window.clearTimeout(debounce.current)
              latest.current = { id: sessionId, text: '', color }
              setDraft('')
              void removeNote(sessionId)
            }}
          >
            {t('edit.delete')}
          </button>
        </div>
      </div>
      <div className="snotes-row">
        <div className="snotes-colors">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              className={`snotes-dot ${c}${color === c ? ' sel' : ''}`}
              onClick={() => {
                setColor(c)
                if (draft !== '' || currentNote !== undefined) persist(draft, c)
              }}
            />
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span className="snotes-status">{status}</span>
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
          const note = state.notes[row.id]
          const isCurrent = row.id === sessionId
          const title = row.title.length > ROW_TITLE_CHARS ? `${row.title.slice(0, ROW_TITLE_CHARS)}…` : row.title
          const workspace = row.workspace === undefined ? undefined : (row.workspace.length > ROW_WORKSPACE_CHARS ? `${row.workspace.slice(0, ROW_WORKSPACE_CHARS)}…` : row.workspace)
          const hover = row.workspace === undefined ? `${row.title} — ${note.text}` : `${row.workspace} / ${row.title} — ${note.text}`
          const pinned = note.pinned === true
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
              <span className={`snotes-flag ${note.color}`} />
              <span className="snotes-item-text">
                {workspace !== undefined && <span className="snotes-item-workspace">{workspace}</span>}
                <span className="snotes-item-title">{pinned ? '📌 ' : ''}{title}{isCurrent ? ` · ${t('all.current')}` : ''}</span>
              </span>
              <button
                type="button"
                className={`snotes-pin${pinned ? ' on' : ''}`}
                title={pinned ? t('edit.unpin') : t('edit.pin')}
                onClick={(e) => { e.stopPropagation(); void saveNote(row.id, { pinned: !pinned }) }}
              >
                📌
              </button>
              <CopyButton
                text={note.text}
                label={t('edit.copy')}
                copiedLabel={t('edit.copied')}
                mini
              />
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

/** Bottom persistent bar for the current session's note. */
export function NotesBar(props: NotesUiProps): JSX.Element | null {
  const { sessionId, useNotes, openPopover, t } = props
  ensureStyles()
  const note = useNotes((s) => (sessionId === undefined ? undefined : s.notes[sessionId]))
  if (sessionId === undefined || note === undefined || note.text === '') return null
  return (
    <div className="snotes-bar">
      <span className={`snotes-flag ${note.color}`} />
      <strong style={{ flex: 'none' }}>{t('bar.label')}</strong>
      <span
        className="snotes-bar-text"
        title={note.text}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          openPopover({ left: rect.left, top: rect.top, height: rect.height })
        }}
      >
        {note.text}
      </span>
      <CopyButton
        text={note.text}
        label={t('edit.copy')}
        copiedLabel={t('edit.copied')}
        mini
      />
    </div>
  )
}
