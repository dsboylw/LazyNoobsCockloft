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
 * @param {unknown} raw - candidate note.
 * @returns {unknown} normalized note or undefined when the input is invalid.
 */
function sanitizeNote(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 128 ? raw.id : undefined;
  if (id === undefined) return undefined;
  const text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_NOTE_CHARS) : '';
  const color = typeof raw.color === 'string' && /^[a-z]{1,16}$/.test(raw.color) ? raw.color : 'default';
  const pinned = raw.pinned === true;
  const updated = typeof raw.updated === 'number' && Number.isFinite(raw.updated) ? raw.updated : Date.now();
  return { id, text, color, pinned, updated };
}

/**
 * Schema replacement (schemastery-style): coerce + validate the settings
 * section in one pass, filling defaults for missing fields.
 * @param {unknown} raw - unvalidated section.
 * @returns {{ notes: Record<string, unknown>, barEnabled: boolean }} validated section.
 */
function validateSection(raw) {
  const src = (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) ? raw : {};
  const rawNotes = (typeof src.notes === 'object' && src.notes !== null && !Array.isArray(src.notes)) ? src.notes : {};
  const notes = {};
  const entries = Object.entries(rawNotes);
  const pinnedFirst = entries
    .map(([id, value]) => sanitizeNote({ id, ...((typeof value === 'object' && value !== null) ? value : {}) }))
    .filter((n) => n !== undefined)
    // an emptied note is a deleted note — never persist text-less records
    .filter((n) => n.text !== '')
    .sort((a, b) => b.updated - a.updated);
  for (const note of pinnedFirst.slice(0, MAX_NOTES)) notes[note.id] = note;
  return { notes, barEnabled: src.barEnabled !== false };
}

/** Send a JSON response. */
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
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
 * Build the API prefix route.
 * GET  /settings        → full section
 * POST /settings        → replace section (validated)
 * GET  /notes           → { ok, notes }
 * PUT  /notes/<id>      → upsert one note { text, color, pinned }
 * DELETE /notes/<id>    → remove one note
 * @param {(section: unknown) => Promise<void>} replaceSection - durable section writer.
 * @param {() => unknown} readSection - durable section reader.
 * @returns the webserver route registration.
 */
function createNotesRoute(replaceSection, readSection) {
  return {
    kind: 'prefix',
    path: NOTES_API_PATH,
    handler: (req, res) => {
      void (async () => {
        const url = new URL(req.url ?? '/', 'http://x');
        const path = url.pathname.slice(NOTES_API_PATH.length) || '/';
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
            const section = validateSection(parsed);
            await replaceSection(section);
            sendJson(res, 200, { ok: true, section: readSection() });
            return;
          }
          if (path === '/notes' && req.method === 'GET') {
            sendJson(res, 200, { ok: true, notes: readSection().notes });
            return;
          }
          const noteMatch = /^\/notes\/([^/]+)$/.exec(path);
          if (noteMatch !== null && (req.method === 'PUT' || req.method === 'DELETE')) {
            const id = decodeURIComponent(noteMatch[1]);
            const section = readSection();
            const notes = { ...section.notes };
            if (req.method === 'DELETE') {
              delete notes[id];
            } else {
              const raw = await readJsonBody(req);
              if (raw === undefined) { sendJson(res, 400, { ok: false, error: 'expected a JSON body' }); return; }
              let parsed;
              try { parsed = JSON.parse(raw); } catch { sendJson(res, 400, { ok: false, error: 'invalid JSON' }); return; }
              const prev = notes[id];
              const note = sanitizeNote({
                id,
                // PATCH semantics: an omitted field keeps the previous value;
                // an explicitly sent empty text still deletes the note.
                text: typeof parsed.text === 'string' ? parsed.text : prev?.text,
                color: parsed.color,
                pinned: typeof parsed.pinned === 'boolean' ? parsed.pinned : prev?.pinned,
                updated: Date.now(),
              });
              if (note === undefined) { sendJson(res, 400, { ok: false, error: 'invalid note id' }); return; }
              // Preserve the previous accent color when the caller omits it.
              if (prev !== undefined && typeof parsed.color !== 'string') note.color = prev.color;
              notes[id] = note;
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
    const readSection = () => {
      const value = scope.get();
      return validateSection(value);
    };
    const replaceSection = async (section) => {
      await scope.replace(validateSection(section));
    };
    host.webServer.register(createNotesRoute(replaceSection, readSection));
  });
}

export {
  name, apply, createNotesRoute, validateSection, sanitizeNote,
  NOTES_NAMESPACE, NOTES_API_PATH, MAX_NOTES, MAX_NOTE_CHARS,
};
