/**
 * Browser half of the session-notes plugin. One app-wide store instance fed
 * by the same-origin API route, registered into the session header actions
 * (notes button), the composer dock (persistent bar), and wired to the
 * sessions store for the overview list.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SnapshotSelectorHook } from './store.ts'
import { Store, bindSelector } from './store.ts'
import type { NotesSection } from './contract.ts'
import { deleteNote as apiDeleteNote, fetchSection, putBarEnabled as apiPutBarEnabled, putNote as apiPutNote } from './api.ts'
import { copyText } from './clipboard.ts'
import { ensureStyles } from './styles.ts'
import { NS, dictionaries } from './locales.ts'
import { NotesBar, NotesPopover, type NotesState, type NotesUiProps, type PopoverAnchor, type SessionRow } from './ui.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-notes': keyof typeof dictionaries.zh
  }
}

/** Business face injected into every notes slot entry. */
export interface NotesInjected {
  /** The session binding key — passed to the inject factory by the renderer. */
  sessionId: string | undefined
  useNotes: SnapshotSelectorHook<NotesState>
  saveNote: NotesUiProps['saveNote']
  removeNote: NotesUiProps['removeNote']
  saveBarEnabled: NotesUiProps['saveBarEnabled']
  openPopover: (anchor: PopoverAnchor) => void
  closePopover: () => void
  openSession: (id: string) => void
  sessionRows: SessionRow[]
}

/** Required services. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces']

interface SessionsService {
  list: {
    getSnapshot(): { current?: string; byId: Record<string, { id: string; displayTitle?: string; title?: string }> }
    subscribe(fn: () => void): () => void
  }
  open(id: string): void
}

interface WorkspacesService {
  list: {
    getSnapshot(): { items: Array<{ workspaceId: string; title?: string; sessionIds: string[] }> }
    subscribe(fn: () => void): () => void
  }
}

/** Client plugin body. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'session-notes: dictionaries')

  const store = new Store<NotesState>({
    notes: {},
    barEnabled: true,
    popover: { open: false, anchor: null },
  })
  const useNotes = bindSelector(store)
  const sessions = ctx.sessions as unknown as SessionsService

  // Seed from the durable section once.
  void fetchSection().then((result) => {
    store.set((s) => ({ ...s, notes: result.section.notes, barEnabled: result.section.barEnabled }))
  }).catch(() => { /* the surfaces show stale-empty; retry happens on next save */ })

  // Mirror the sessions list into plain rows for the overview, annotated with
  // the owning workspace name. Both projections are cheap in-memory reads.
  let sessionRows: SessionRow[] = []
  let workspaceBySession: Record<string, string> = {}
  const projectRows = (): void => {
    const snapshot = sessions.list.getSnapshot()
    sessionRows = Object.values(snapshot.byId).map((row) => ({
      id: row.id,
      title: row.displayTitle ?? row.title ?? row.id.slice(0, 8),
      workspace: workspaceBySession[row.id],
    }))
  }
  projectRows()
  ctx.effect(() => sessions.list.subscribe(projectRows), 'session-notes: session rows projection')

  // Track which workspace owns each session; only recomputes on workspace changes.
  const workspaces = (ctx as unknown as { workspaces?: WorkspacesService }).workspaces
  if (workspaces !== undefined) {
    const projectWorkspaces = (): void => {
      const map: Record<string, string> = {}
      for (const ws of workspaces.list.getSnapshot().items) {
        const name = ws.title ?? ws.workspaceId
        if (name === '') continue
        for (const id of ws.sessionIds) map[id] = name
      }
      workspaceBySession = map
      projectRows()
    }
    projectWorkspaces()
    ctx.effect(() => workspaces.list.subscribe(projectWorkspaces), 'session-notes: workspace rows projection')
  }

  const saveNote: NotesInjected['saveNote'] = async (id, payload) => {
    try {
      const result = await apiPutNote(id, payload)
      store.set((s) => ({ ...s, notes: result.notes }))
      return true
    } catch {
      return false
    }
  }

  const removeNote: NotesInjected['removeNote'] = async (id) => {
    try {
      const result = await apiDeleteNote(id)
      store.set((s) => ({ ...s, notes: result.notes }))
      return true
    } catch {
      return false
    }
  }

  const saveBarEnabled: NotesInjected['saveBarEnabled'] = async (barEnabled) => {
    try {
      const result = await apiPutBarEnabled(barEnabled)
      store.set((s) => ({ ...s, notes: result.section.notes, barEnabled: result.section.barEnabled }))
      return true
    } catch {
      return false
    }
  }

  const openPopover = (anchor: PopoverAnchor): void => {
    store.set((s) => ({ ...s, popover: { open: true, anchor } }))
  }
  const closePopover = (): void => {
    store.set((s) => (s.popover.open ? { ...s, popover: { open: false, anchor: null } } : s))
  }
  const openSession = (id: string): void => {
    try {
      sessions.open(id)
    } catch {
      // sessions service unavailable — the overview still shows copyable notes
    }
  }

  // The renderer calls the inject factory as inject(binding.key, actions) —
  // the first argument is the session id of the current binding.
  const injected = (sessionId?: string): NotesInjected => ({
    sessionId, useNotes, saveNote, removeNote, saveBarEnabled, openPopover, closePopover, openSession, sessionRows,
  })

  // Header button: 📝 with a dot when the current session has a note.
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'session-notes',
    order: 25,
    locale: NS,
    inject: injected,
  }, HeaderButtonEntry))

  // Bottom persistent bar above the composer dock.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'session-notes',
    order: 20,
    locale: NS,
    inject: injected,
  }, NotesBarEntry))
}

/** Header button + popover host. */
function HeaderButtonEntry(props: NotesInjected & { sessionId?: string; t: (key: string) => string }): JSX.Element {
  const { sessionId, useNotes, openPopover, closePopover, openSession, sessionRows, t, saveNote, removeNote, saveBarEnabled } = props
  ensureStyles()
  const state = useNotes((s) => s)
  const hasNote = sessionId !== undefined && state.notes[sessionId] !== undefined
  return (
    <>
      <button
        type="button"
        className="snotes-mini snotes-trigger"
        style={{ position: 'relative' }}
        title={t('header.open')}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          if (state.popover.open) closePopover()
          else openPopover({ left: rect.left, top: rect.top, height: rect.height })
        }}
      >
        {t('header.open')}
        {hasNote && <span style={{ position: 'absolute', top: 0, right: 0, width: 6, height: 6, borderRadius: '50%', background: '#57ab5a' }} />}
      </button>
      {state.popover.open && (
        <NotesPopover
          sessionId={sessionId}
          useNotes={useNotes}
          saveNote={saveNote}
          removeNote={removeNote}
          saveBarEnabled={saveBarEnabled}
          openPopover={openPopover}
          closePopover={closePopover}
          openSession={openSession}
          rows={sessionRows}
          t={t}
        />
      )}
    </>
  )
}

/** Characters shown for the workspace name in the bottom bar before an ellipsis. */
const BAR_WORKSPACE_CHARS = 5
/** Characters shown for the session title in the bottom bar before an ellipsis. */
const BAR_TITLE_CHARS = 8
/** Characters shown for the note preview in the bottom bar before an ellipsis. */
const BAR_PREVIEW_CHARS = 20

/** Bottom bar entry. */
function NotesBarEntry(props: NotesInjected & { sessionId?: string; t: (key: string) => string }): JSX.Element | null {
  const { sessionId, useNotes, sessionRows, openPopover, t } = props
  ensureStyles()
  const note = useNotes((s) => (sessionId === undefined ? undefined : s.notes[sessionId]))
  const barEnabled = useNotes((s) => s.barEnabled)
  if (sessionId === undefined || note === undefined || note.text === '' || !barEnabled) return null
  const row = sessionRows.find((r) => r.id === sessionId)
  const rawWorkspace = row?.workspace
  const workspace = rawWorkspace === undefined ? undefined : (rawWorkspace.length > BAR_WORKSPACE_CHARS ? `${rawWorkspace.slice(0, BAR_WORKSPACE_CHARS)}…` : rawWorkspace)
  const rawTitle = row?.title ?? sessionId
  const title = rawTitle.length > BAR_TITLE_CHARS ? `${rawTitle.slice(0, BAR_TITLE_CHARS)}…` : rawTitle
  const preview = note.text.length > BAR_PREVIEW_CHARS ? `${note.text.slice(0, BAR_PREVIEW_CHARS)}…` : note.text
  return (
    <div className="snotes-bar snotes-trigger">
      <span className={`snotes-flag ${note.color}`} />
      <strong style={{ flex: 'none' }}>{t('bar.label')}</strong>
      {workspace !== undefined && <span className="snotes-bar-workspace" title={rawWorkspace}>{workspace}</span>}
      <span className="snotes-bar-title" title={rawTitle}>{title}</span>
      <span
        className="snotes-bar-text"
        title={note.text}
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          openPopover({ left: rect.left, top: rect.top, height: rect.height })
        }}
      >
        {preview}
      </span>
      <button
        type="button"
        className="snotes-mini"
        onClick={(e) => {
          e.stopPropagation()
          copyText(note.text)
        }}
      >
        {t('edit.copy')}
      </button>
    </div>
  )
}

export { NotesBar, NotesPopover }
export type { NotesState, NotesUiProps, SessionRow, PopoverAnchor }
