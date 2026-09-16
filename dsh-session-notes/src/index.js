/**
 * dsh-session-notes — session notes plugin for DSH desktop.
 * Host entry: registers the durable `dsh-session-notes` settings namespace
 * and the same-origin API route the browser bundle calls.
 * @module @deepseek-ai/dsh-session-notes
 */

const NOTES_NAMESPACE = 'dsh-session-notes';
const NOTES_API_PATH = '/plugins/dsh-session-notes/api';
const MAX_NOTES = 2000;
const MAX_NOTE_CHARS = 20000;

/** Plugin identifier for the cordis loader. */
const name = '@deepseek-ai/dsh-session-notes';

/**
 * Sanitize one note record.
 * 0.3.x shape: notes[key] = { id, sessionId, text, color, pinned, updated, seq? }.
 * Legacy 0.2.x shape (notes[sessionId] without a sessionId field) migrates in
 * place: id = key, sessionId = key — one note per session, nothing lost.
 * `seq` (stable per-session order number) is assigned by validateSection when
 * absent; this function only coerces/preserves it.
 * @param {unknown} raw - candidate note.
 * @param {string} fallbackId - record key (used as id when raw.id is absent).
 * @returns {object|undefined} normalized note, or undefined when invalid.
 */
function sanitizeNote(raw, fallbackId) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 128 ? raw.id
    : (typeof fallbackId === 'string' && fallbackId.length > 0 && fallbackId.length <= 128 ? fallbackId : undefined);
  if (id === undefined) return undefined;
  const sessionId = typeof raw.sessionId === 'string' && raw.sessionId.length > 0 && raw.sessionId.length <= 128 ? raw.sessionId : id;
  const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_NOTE_CHARS) : '';
  const color = typeof raw.color === 'string' && /^[a-z]{1,16}$/.test(raw.color) ? raw.color : 'default';
  const pinned = raw.pinned === true;
  const updated = typeof raw.updated === 'number' && Number.isFinite(raw.updated) ? raw.updated : Date.now();
  const seq = typeof raw.seq === 'number' && Number.isFinite(raw.seq) && raw.seq >= 1 ? Math.floor(raw.seq) : undefined;
  return { id, sessionId, text, color, pinned, updated, ...(seq !== undefined ? { seq } : {}) };
}

/** True when a note record is a 0.3.x multi-note (per-note id ≠ session id). */
function isMultiNote(note) {
  return note.id !== note.sessionId;
}

/**
 * Schema replacement (schemastery-style): coerce + validate the settings
 * section in one pass. An emptied LEGACY note (id = sessionId) is a delete;
 * an emptied multi-note is a draft in progress and survives.
 * Assigns `seq` to records missing one: max(existing seq in session) + 1,
 * processing oldest-first so creation order is honored.
 */
function validateSection(raw) {
  const src = (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) ? raw : {};
  const rawNotes = (typeof src.notes === 'object' && src.notes !== null && !Array.isArray(src.notes)) ? src.notes : {};
  const valid = Object.entries(rawNotes)
    .map(([key, value]) => sanitizeNote({ id: key, ...((typeof value === 'object' && value !== null) ? value : {}) }, key))
    .filter((n) => n !== undefined)
    .filter((n) => n.text !== '' || isMultiNote(n))
    .sort((a, b) => a.updated - b.updated); // oldest first → seq follows creation order
  const maxSeq = {};
  const notes = {};
  for (const note of valid.slice(-MAX_NOTES)) {
    if (note.seq === undefined) {
      maxSeq[note.sessionId] = (maxSeq[note.sessionId] ?? 0) + 1;
      note.seq = maxSeq[note.sessionId];
    } else {
      maxSeq[note.sessionId] = Math.max(maxSeq[note.sessionId] ?? 0, note.seq);
    }
    notes[note.id] = note;
  }
  return { notes, barEnabled: src.barEnabled !== false };
}

/** Send a JSON response. */
function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Read a JSON request body with a hard size cap. */
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        if (!done) { done = true; resolve(undefined); }
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!done) { done = true; resolve(chunks.length === 0 ? undefined : Buffer.concat(chunks).toString('utf8')); } });
    req.on('error', () => { if (!done) { done = true; resolve(undefined); } });
  });
}

/**
 * Upsert one note from a PATCH-style payload.
 * Semantics table (0.3.2):
 *   prev exists, payload.text omitted      → text/color/pinned/seq stay (PATCH)
 *   payload.pinned only (pin-only PUT)     → `updated` NOT bumped (stable order)
 *   prev absent, payload.sessionId present → new multi-note (empty text OK)
 *   prev absent, no sessionId (legacy)     → sessionId = key; empty text = delete
 * @param {object} notes - mutable notes map of the current section.
 * @param {string} key - note id from the URL.
 * @param {object} parsed - JSON payload.
 * @returns {object|undefined} the stored note, or undefined when invalid.
 */
function upsertNote(notes, key, parsed) {
  const prev = notes[key];
  const legacyShape = prev === undefined && !(typeof parsed.sessionId === 'string' && parsed.sessionId.length > 0);
  const pinOnly = typeof parsed.pinned === 'boolean'
    && typeof parsed.text !== 'string'
    && typeof parsed.color !== 'string'
    && typeof parsed.sessionId !== 'string';
  const note = sanitizeNote({
    id: key,
    sessionId: typeof parsed.sessionId === 'string' && parsed.sessionId.length > 0 ? parsed.sessionId
      : (prev !== undefined ? prev.sessionId : (legacyShape ? key : undefined)),
    text: typeof parsed.text === 'string' ? parsed.text : prev?.text,
    color: typeof parsed.color === 'string' ? parsed.color : prev?.color,
    pinned: typeof parsed.pinned === 'boolean' ? parsed.pinned : prev?.pinned,
    seq: prev?.seq,
    updated: pinOnly && prev !== undefined ? prev.updated : Date.now(),
  }, key);
  if (note === undefined) return undefined;
  notes[key] = note;
  return note;
}

/**
 * Build the API prefix route.
 * GET  /settings              → full section
 * POST /settings              → replace section (validated)
 * GET  /notes                 → { ok, notes }
 * PUT  /notes/<id>            → upsert one note (PATCH semantics, see upsertNote)
 * PUT  /notes/session:<sid>   → recolor every note of that session
 * DELETE /notes/<id>          → remove one note
 * Note: the client percent-encodes the colon in `session:<sid>` (%3A), so the
 * path is decoded BEFORE route matching.
 */
function createNotesRoute(replaceSection, readSection) {
  return {
    kind: 'prefix',
    path: NOTES_API_PATH,
    handler: (req, res) => {
      void (async () => {
        const url = new URL(req.url ?? '/', 'http://x');
        const path = decodeURIComponent(url.pathname.slice(NOTES_API_PATH.length) || '/');
        try {
          if (path === '/settings' && (req.method === 'GET' || req.method === 'HEAD')) {
            sendJson(res, 200, { ok: true, section: readSection() });
            return;
          }
          if (path === '/settings' && req.method === 'POST') {
            const raw = await readJsonBody(req);
            if (raw === undefined) { sendJson(res, 400, { ok: false, error: 'expected a JSON body' }); return; }
            let parsed;
            try { parsed = JSON.parse(raw); } catch { sendJson(res, 400, { ok: false, error: 'invalid JSON' }); return; }
            await replaceSection(validateSection(parsed));
            sendJson(res, 200, { ok: true, section: readSection() });
            return;
          }
          if (path === '/notes' && req.method === 'GET') {
            sendJson(res, 200, { ok: true, notes: readSection().notes });
            return;
          }
          const recolorMatch = /^\/notes\/session:(.+)$/.exec(path);
          if (recolorMatch !== null && req.method === 'PUT') {
            const sid = recolorMatch[1];
            const raw = await readJsonBody(req);
            if (raw === undefined) { sendJson(res, 400, { ok: false, error: 'expected a JSON body' }); return; }
            let parsed;
            try { parsed = JSON.parse(raw); } catch { sendJson(res, 400, { ok: false, error: 'invalid JSON' }); return; }
            if (typeof parsed.color !== 'string' || !/^[a-z]{1,16}$/.test(parsed.color)) {
              sendJson(res, 400, { ok: false, error: 'expected a color' });
              return;
            }
            const section = readSection();
            const notes = { ...section.notes };
            for (const [k, n] of Object.entries(notes)) {
              if (n.sessionId === sid) notes[k] = { ...n, color: parsed.color, updated: Date.now() };
            }
            await replaceSection({ notes, barEnabled: section.barEnabled });
            sendJson(res, 200, { ok: true, notes: readSection().notes });
            return;
          }
          const noteMatch = /^\/notes\/([^/]+)$/.exec(path);
          if (noteMatch !== null && (req.method === 'PUT' || req.method === 'DELETE')) {
            const key = decodeURIComponent(noteMatch[1]);
            const section = readSection();
            const notes = { ...section.notes };
            if (req.method === 'DELETE') {
              delete notes[key];
            } else {
              const raw = await readJsonBody(req);
              if (raw === undefined) { sendJson(res, 400, { ok: false, error: 'expected a JSON body' }); return; }
              let parsed;
              try { parsed = JSON.parse(raw); } catch { sendJson(res, 400, { ok: false, error: 'invalid JSON' }); return; }
              const note = upsertNote(notes, key, parsed);
              if (note === undefined) { sendJson(res, 400, { ok: false, error: 'invalid note id' }); return; }
            }
            await replaceSection({ notes, barEnabled: section.barEnabled });
            sendJson(res, 200, { ok: true, notes: readSection().notes });
            return;
          }
          sendJson(res, 404, { ok: false, error: 'unknown route' });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String((error instanceof Error && error.message) || error) });
        }
      })();
    },
  };
}

/** Host apply: register the settings namespace + API route when services exist. */
function apply(ctx) {
  ctx.inject(['settings', 'webServer'], (host) => {
    // The settings service resolves by CALLING the schema with the merged
    // value (schemastery-style), so the schema must be callable; describe()
    // additionally calls schema.toJSON() for configuration surfaces.
    const schema = (value) => validateSection(value);
    schema.toJSON = () => ({ type: 'object' });
    const scope = host.settings.register(NOTES_NAMESPACE, schema);
    const readSection = () => validateSection(scope.get());
    const replaceSection = async (section) => {
      await scope.replace(validateSection(section));
    };
    host.webServer.register(createNotesRoute(replaceSection, readSection));
  });
}

export {
  name, apply, createNotesRoute, upsertNote, validateSection, sanitizeNote, isMultiNote,
  NOTES_NAMESPACE, NOTES_API_PATH, MAX_NOTES, MAX_NOTE_CHARS,
};
