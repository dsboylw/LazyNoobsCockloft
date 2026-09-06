# dsh-session-notes

**Session notes plugin for DSH** (works on both DSH Desktop and Web; `web` platform client plugin). Attach a note to every conversation so you never have to dig through chat history to find your prompts.

[中文](README.md) | [English](README.en.md)

> ⚠️ **Built and tested on DSH Desktop 0.7.1**; verified working on 0.7.2.

## Why this plugin exists

While using DSH Desktop I kept hitting the same annoyance: in one session I'd reuse the same prompt over and over to pull data, and every time I had to scroll back through the chat history, copy the prompt, and paste it back in. Right-clicking the session offered no note field, so I decided to just write one myself.

I had previously installed fun-ticker, found it clunky and uninstalled it — it wasn't built for the desktop app in the first place, and the uninstall didn't clean up fully. So I ended up borrowing parts of its structure to build this notes plugin instead.

Sessions with notes show up in the overview: click a note to jump straight to that session, and one-click copy whatever you wrote — e.g. the prompt itself.

Lazy~~~~ that's just who I am ~ Noob and lazy, what can I do…

## Features

- **📝 Header button** (next to the conversation title): opens the edit popover; shows a green dot when the current session has a note
- **Edit popover**
  - Edit the current session's note, debounced autosave (400 ms), shows "Saved ✓"
  - **Copy button**: one-click copy of the full note
  - 5 color markers (default / amber / rose / sky / lime)
  - **All-notes overview**: every session that has a note (workspace badge + title + note preview + per-row copy button); click a row to jump straight to that session
  - Bottom-bar toggle (persisted)
- **Persistent bottom bar**: when the current session has a note, a strip shows above the composer (color dot + workspace badge + session title + note preview + copy button); clicking the preview opens the popover
- **Long-text truncation**: overview rows show workspace 5 chars / title 8 chars / note 15 chars, the bottom bar shows workspace 5 chars / title 8 chars / note 20 chars; longer text ends with … — hover for the full text, while **copy buttons always copy the full content**
- Data is stored in the host settings document (namespace `dsh-session-notes`), persisted per session id, survives restarts
- Clearing the note text deletes the note; limits: 2000 notes / 20000 chars per note

## Install (DSH Desktop)

**Option A: one-click script (recommended)**

```powershell
# inside the repo / extracted folder
powershell -ExecutionPolicy Bypass -File .\build.ps1     # build from source (skip for release zip)
powershell -ExecutionPolicy Bypass -File .\install.ps1   # copy into profile + patch
# restart DSH Desktop (fully quit, then reopen)
```

**Option B: manual**

1. Copy `package.json` + `lib\index.js` + `lib\client.js` into
   `%APPDATA%\dsh-desktop\harness\profiles\web\node_modules\@deepseek-ai\dsh-session-notes\` (keep the `lib\` subdirectory)
2. Edit `%APPDATA%\dsh-desktop\harness\profiles\web\cordis.patch.yml`, inside the **first `- insert:` block** add:

   ```yaml
   - insert:
       # ...existing rows...
       - id: session-notes
         name: '@deepseek-ai/dsh-session-notes'
   ```

3. Restart DSH Desktop

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall.ps1
# or manually: remove the two session-notes rows from cordis.patch.yml + delete the package dir from node_modules
```

The scripts back up `cordis.patch.yml` automatically (`cordis.patch.yml.bak-<timestamp>`). If the app fails to start, desktop safe mode auto-quarantines the plugin; restore from the backup afterwards.

## Build

Requirements: Windows PowerShell, node ≥ 20, an [esbuild](https://esbuild.github.io/) binary (edit the `$Esbuild` variable in the script to your local path).

```powershell
.\build.ps1
```

- Host side: `src/index.js` → ESM bundle (external `@deepseek-ai/*`; the closure is provided by the DSH app)
- Client side: `src/client/index.tsx` → CJS bundle (external `react` / `react-dom` / `@deepseek-ai/*`), wrapped in `window.__ModuleLoader__.load({ id, factory })`
- Smoke tests: stubbed host services + ModuleLoader, covering the full host route flow and client slot registration

## Architecture / Slots

| Side | Entry | What it does |
|---|---|---|
| Host | `src/index.js` | Registers the settings namespace (callable schema + `toJSON`) and the API route |
| Client | `src/client/index.tsx` | Slot registration, store, session-row projection; `inject: ['slots', 'locale', 'sessions']` |

| Slot | Content |
|---|---|
| `conversation.session.header.actions` | 📝 button + popover |
| `conversation.input.dock` | persistent bottom note bar |

**API** (`/plugins/dsh-session-notes/api`, host `webServer` service, prefix route):

| Method | Path | Description |
|---|---|---|
| GET | `/settings` | Read everything (notes + barEnabled) |
| POST | `/settings` | Replace wholesale (server-side validation/sanitizing) |
| GET | `/notes` | Read the notes table |
| PUT | `/notes/:id` | Upsert (text/color/pinned; missing color keeps the previous value) |
| DELETE | `/notes/:id` | Delete one note |

**Gotchas** (for future DSH plugin authors):

- The host HTTP service is called `webServer` (`ctx.inject(['settings', 'webServer'], ...)` + `host.webServer.register(...)`); there is no `httpServer` service
- A slot entry's `sessionId` is **not a component prop** — it is the first argument of the inject factory: `inject: (sessionId) => ({ ... })`
- The client bundle must be CJS wrapped as `window.__ModuleLoader__.load({ id: "<package name>", factory: (require) => {...} })`; `react` / `react/jsx-runtime` are provided by the loader's require
- The settings schema must be callable (`resolve` executes `schema(merged)`) and expose `.toJSON()` (used by `describe()`)

## Layout

```
src/index.js            host entry: settings + API routes
src/client/index.tsx    client entry: slot registration, store, session projection
src/client/ui.tsx       popover + bottom bar UI
src/client/store.ts     self-contained observable store + useSyncExternalStore hook
src/client/api.ts       same-origin fetch wrapper
src/client/clipboard.ts copy (clipboard API + execCommand fallback)
src/client/locales.ts   zh/en dictionaries
src/client/styles.ts    style injection (dsw CSS variables, light/dark aware)
build.ps1               build + smoke tests
install.ps1             one-click install into the desktop profile
uninstall.ps1           one-click uninstall
test/smoke.mjs          smoke tests (host + client)
test/host-drive.mjs     host route direct-drive regression
```

## License

MIT
