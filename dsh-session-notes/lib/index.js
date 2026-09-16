// src/index.js
var NOTES_NAMESPACE = "dsh-session-notes";
var NOTES_API_PATH = "/plugins/dsh-session-notes/api";
var MAX_NOTES = 2e3;
var MAX_NOTE_CHARS = 2e4;
var name = "@deepseek-ai/dsh-session-notes";
function sanitizeNote(raw, fallbackId) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return void 0;
  const id = typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 128 ? raw.id : typeof fallbackId === "string" && fallbackId.length > 0 && fallbackId.length <= 128 ? fallbackId : void 0;
  if (id === void 0) return void 0;
  const sessionId = typeof raw.sessionId === "string" && raw.sessionId.length > 0 && raw.sessionId.length <= 128 ? raw.sessionId : id;
  const text = typeof raw.text === "string" ? raw.text.slice(0, MAX_NOTE_CHARS) : "";
  const color = typeof raw.color === "string" && /^[a-z]{1,16}$/.test(raw.color) ? raw.color : "default";
  const pinned = raw.pinned === true;
  const updated = typeof raw.updated === "number" && Number.isFinite(raw.updated) ? raw.updated : Date.now();
  const seq = typeof raw.seq === "number" && Number.isFinite(raw.seq) && raw.seq >= 1 ? Math.floor(raw.seq) : void 0;
  return { id, sessionId, text, color, pinned, updated, ...seq !== void 0 ? { seq } : {} };
}
function isMultiNote(note) {
  return note.id !== note.sessionId;
}
function validateSection(raw) {
  const src = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const rawNotes = typeof src.notes === "object" && src.notes !== null && !Array.isArray(src.notes) ? src.notes : {};
  const valid = Object.entries(rawNotes).map(([key, value]) => sanitizeNote({ id: key, ...typeof value === "object" && value !== null ? value : {} }, key)).filter((n) => n !== void 0).filter((n) => n.text !== "" || isMultiNote(n)).sort((a, b) => a.updated - b.updated);
  const maxSeq = {};
  const notes = {};
  for (const note of valid.slice(-MAX_NOTES)) {
    if (note.seq === void 0) {
      maxSeq[note.sessionId] = (maxSeq[note.sessionId] ?? 0) + 1;
      note.seq = maxSeq[note.sessionId];
    } else {
      maxSeq[note.sessionId] = Math.max(maxSeq[note.sessionId] ?? 0, note.seq);
    }
    notes[note.id] = note;
  }
  return { notes, barEnabled: src.barEnabled !== false };
}
function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        if (!done) {
          done = true;
          resolve(void 0);
        }
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!done) {
        done = true;
        resolve(chunks.length === 0 ? void 0 : Buffer.concat(chunks).toString("utf8"));
      }
    });
    req.on("error", () => {
      if (!done) {
        done = true;
        resolve(void 0);
      }
    });
  });
}
function upsertNote(notes, key, parsed) {
  const prev = notes[key];
  const legacyShape = prev === void 0 && !(typeof parsed.sessionId === "string" && parsed.sessionId.length > 0);
  const pinOnly = typeof parsed.pinned === "boolean" && typeof parsed.text !== "string" && typeof parsed.color !== "string" && typeof parsed.sessionId !== "string";
  const note = sanitizeNote({
    id: key,
    sessionId: typeof parsed.sessionId === "string" && parsed.sessionId.length > 0 ? parsed.sessionId : prev !== void 0 ? prev.sessionId : legacyShape ? key : void 0,
    text: typeof parsed.text === "string" ? parsed.text : prev?.text,
    color: typeof parsed.color === "string" ? parsed.color : prev?.color,
    pinned: typeof parsed.pinned === "boolean" ? parsed.pinned : prev?.pinned,
    seq: prev?.seq,
    updated: pinOnly && prev !== void 0 ? prev.updated : Date.now()
  }, key);
  if (note === void 0) return void 0;
  notes[key] = note;
  return note;
}
function createNotesRoute(replaceSection, readSection) {
  return {
    kind: "prefix",
    path: NOTES_API_PATH,
    handler: (req, res) => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://x");
        const path = decodeURIComponent(url.pathname.slice(NOTES_API_PATH.length) || "/");
        try {
          if (path === "/settings" && (req.method === "GET" || req.method === "HEAD")) {
            sendJson(res, 200, { ok: true, section: readSection() });
            return;
          }
          if (path === "/settings" && req.method === "POST") {
            const raw = await readJsonBody(req);
            if (raw === void 0) {
              sendJson(res, 400, { ok: false, error: "expected a JSON body" });
              return;
            }
            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch {
              sendJson(res, 400, { ok: false, error: "invalid JSON" });
              return;
            }
            await replaceSection(validateSection(parsed));
            sendJson(res, 200, { ok: true, section: readSection() });
            return;
          }
          if (path === "/notes" && req.method === "GET") {
            sendJson(res, 200, { ok: true, notes: readSection().notes });
            return;
          }
          const recolorMatch = /^\/notes\/session:(.+)$/.exec(path);
          if (recolorMatch !== null && req.method === "PUT") {
            const sid = recolorMatch[1];
            const raw = await readJsonBody(req);
            if (raw === void 0) {
              sendJson(res, 400, { ok: false, error: "expected a JSON body" });
              return;
            }
            let parsed;
            try {
              parsed = JSON.parse(raw);
            } catch {
              sendJson(res, 400, { ok: false, error: "invalid JSON" });
              return;
            }
            if (typeof parsed.color !== "string" || !/^[a-z]{1,16}$/.test(parsed.color)) {
              sendJson(res, 400, { ok: false, error: "expected a color" });
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
          if (noteMatch !== null && (req.method === "PUT" || req.method === "DELETE")) {
            const key = decodeURIComponent(noteMatch[1]);
            const section = readSection();
            const notes = { ...section.notes };
            if (req.method === "DELETE") {
              delete notes[key];
            } else {
              const raw = await readJsonBody(req);
              if (raw === void 0) {
                sendJson(res, 400, { ok: false, error: "expected a JSON body" });
                return;
              }
              let parsed;
              try {
                parsed = JSON.parse(raw);
              } catch {
                sendJson(res, 400, { ok: false, error: "invalid JSON" });
                return;
              }
              const note = upsertNote(notes, key, parsed);
              if (note === void 0) {
                sendJson(res, 400, { ok: false, error: "invalid note id" });
                return;
              }
            }
            await replaceSection({ notes, barEnabled: section.barEnabled });
            sendJson(res, 200, { ok: true, notes: readSection().notes });
            return;
          }
          sendJson(res, 404, { ok: false, error: "unknown route" });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error instanceof Error && error.message || error) });
        }
      })();
    }
  };
}
function apply(ctx) {
  ctx.inject(["settings", "webServer"], (host) => {
    const schema = (value) => validateSection(value);
    schema.toJSON = () => ({ type: "object" });
    const scope = host.settings.register(NOTES_NAMESPACE, schema);
    const readSection = () => validateSection(scope.get());
    const replaceSection = async (section) => {
      await scope.replace(validateSection(section));
    };
    host.webServer.register(createNotesRoute(replaceSection, readSection));
  });
}
export {
  MAX_NOTES,
  MAX_NOTE_CHARS,
  NOTES_API_PATH,
  NOTES_NAMESPACE,
  apply,
  createNotesRoute,
  isMultiNote,
  name,
  sanitizeNote,
  upsertNote,
  validateSection
};
