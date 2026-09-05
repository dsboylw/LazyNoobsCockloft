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
  /** Open the popover anchored at a trigger rect. */
  openPopover: (anchor: PopoverAnchor) => void
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
  popover: { open: boolean; anchor: PopoverAnchor | null }
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
  const left = Math.max(12, Math.min(anchor.left - 40, window.innerWidth - 540))
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
  const rowsWithNotes = rows.filter((row) => row.id !== sessionId && state.notes[row.id] !== undefined)

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
      <div className="snotes-list">
        {rowsWithNotes.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>{t('all.empty')}</div>}
        {rowsWithNotes.map((row) => {
          const note = state.notes[row.id]
          return (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              className="snotes-item"
              onClick={() => { closePopover(); openSession(row.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { closePopover(); openSession(row.id) } }}
            >
              <span className={`snotes-flag ${note.color}`} />
              <span className="snotes-item-text">
                <span className="snotes-item-title">{row.title}</span>
                {note.text === '' ? t('edit.empty') : note.text}
              </span>
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
