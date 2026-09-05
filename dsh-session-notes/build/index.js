// plugin-src/dsh-session-notes/src/index.js
var NOTES_NAMESPACE = "dsh-session-notes";
var NOTES_API_PATH = "/plugins/dsh-session-notes/api";
var MAX_NOTES = 2e3;
var MAX_NOTE_CHARS = 2e4;
var name = "@deepseek-ai/dsh-session-notes";
function sanitizeNote(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return void 0;
  const id = typeof raw.id === "string" && raw.id.length > 0 && raw.id.length <= 128 ? raw.id : void 0;
  if (id === void 0) return void 0;
  const text = typeof raw.text === "string" ? raw.text.slice(0, MAX_NOTE_CHARS) : "";
  const color = typeof raw.color === "string" && /^[a-z]{1,16}$/.test(raw.color) ? raw.color : "default";
  const pinned = raw.pinned === true;
  const updated = typeof raw.updated === "number" && Number.isFinite(raw.updated) ? raw.updated : Date.now();
  return { id, text, color, pinned, updated };
}
function validateSection(raw) {
  const src = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  const rawNotes = typeof src.notes === "object" && src.notes !== null && !Array.isArray(src.notes) ? src.notes : {};
  const notes = {};
  const entries = Object.entries(rawNotes);
  const pinnedFirst = entries.map(([id, value]) => sanitizeNote({ id, ...typeof value === "object" && value !== null ? value : {} })).filter((n) => n !== void 0).filter((n) => n.text !== "").sort((a, b) => b.updated - a.updated);
  for (const note of pinnedFirst.slice(0, MAX_NOTES)) notes[note.id] = note;
  return { notes, barEnabled: src.barEnabled !== false };
}
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
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
function createNotesRoute(replaceSection, readSection) {
  return {
    kind: "prefix",
    path: NOTES_API_PATH,
    handler: (req, res) => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://x");
        const path = url.pathname.slice(NOTES_API_PATH.length) || "/";
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
            const section = validateSection(parsed);
            await replaceSection(section);
            sendJson(res, 200, { ok: true, section: readSection() });
            return;
          }
          if (path === "/notes" && req.method === "GET") {
            sendJson(res, 200, { ok: true, notes: readSection().notes });
            return;
          }
          const noteMatch = /^\/notes\/([^/]+)$/.exec(path);
          if (noteMatch !== null && (req.method === "PUT" || req.method === "DELETE")) {
            const id = decodeURIComponent(noteMatch[1]);
            const section = readSection();
            const notes = { ...section.notes };
            if (req.method === "DELETE") {
              delete notes[id];
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
              const prev = notes[id];
              const note = sanitizeNote({
                id,
                text: parsed.text,
                color: parsed.color,
                pinned: parsed.pinned,
                updated: Date.now()
              });
              if (note === void 0) {
                sendJson(res, 400, { ok: false, error: "invalid note id" });
                return;
              }
              if (prev !== void 0 && typeof parsed.color !== "string") note.color = prev.color;
              notes[id] = note;
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
  MAX_NOTES,
  MAX_NOTE_CHARS,
  NOTES_API_PATH,
  NOTES_NAMESPACE,
  apply,
  createNotesRoute,
  name,
  sanitizeNote,
  validateSection
};
