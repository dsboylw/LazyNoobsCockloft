window.__ModuleLoader__.load({ id: "@deepseek-ai/dsh-session-notes", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lazyrookie/dsh-session-notes/src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  NotesBar: () => NotesBar,
  NotesPopover: () => NotesPopover,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// lazyrookie/dsh-session-notes/src/client/store.ts
var import_react = require("react");
var Store = class {
  /** @param {S} initial */
  constructor(initial) {
    this.state = initial;
    this.listeners = /* @__PURE__ */ new Set();
  }
  /** @returns {S} */
  getSnapshot() {
    return this.state;
  }
  /** @param {() => void} fn @returns {() => void} unsubscribe */
  subscribe(fn) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  /**
   * Apply one state transform and notify when the snapshot changes.
   * @param {(draft: S) => S} transform
   */
  set(transform) {
    const next = transform(this.state);
    if (next !== this.state) {
      this.state = next;
      for (const listener of this.listeners) listener();
    }
  }
};
function bindSelector(store) {
  return function useSelector(selector, isEqual = (a, b) => a === b) {
    const selectorRef = (0, import_react.useRef)(selector);
    selectorRef.current = selector;
    const isEqualRef = (0, import_react.useRef)(isEqual);
    isEqualRef.current = isEqual;
    const cache = (0, import_react.useRef)({ has: false, state: void 0, selected: void 0 });
    const getSelected = (0, import_react.useCallback)(() => {
      const state = store.getSnapshot();
      const last = cache.current;
      if (last.has && Object.is(last.state, state)) return last.selected;
      const selected = selectorRef.current(state);
      if (last.has && isEqualRef.current(last.selected, selected)) {
        cache.current = { has: true, state, selected: last.selected };
        return last.selected;
      }
      cache.current = { has: true, state, selected };
      return selected;
    }, [store]);
    return (0, import_react.useSyncExternalStore)(
      (0, import_react.useCallback)((fn) => store.subscribe(fn), [store]),
      getSelected,
      getSelected
    );
  };
}

// lazyrookie/dsh-session-notes/src/client/contract.ts
var API_BASE = "/plugins/dsh-session-notes/api";
var NOTE_COLORS = ["default", "amber", "rose", "sky", "lime"];
var SAVE_DEBOUNCE_MS = 400;

// lazyrookie/dsh-session-notes/src/client/api.ts
async function request(path, init) {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) throw new Error(`session-notes api ${String(response.status)}`);
  return await response.json();
}
function fetchSection() {
  return request("/settings");
}
function putNote(id, payload) {
  return request(`/notes/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}
function deleteNote(id) {
  return request(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
function putBarEnabled(barEnabled) {
  return request("/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ barEnabled })
  });
}

// lazyrookie/dsh-session-notes/src/client/clipboard.ts
async function copyText(text) {
  if (text === "") return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText !== void 0) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

// lazyrookie/dsh-session-notes/src/client/styles.ts
var css = `
.snotes-pop {
  position: fixed; z-index: 1000; min-width: 380px; max-width: 520px;
  max-height: 70vh; overflow: auto;
  background: var(--dsw-specific-elevated-fill, var(--dsw-specific-sidebar-fill, #1f1f1f));
  color: var(--dsw-alias-label-primary, #eee);
  border: 1px solid var(--dsw-alias-line-primary, #333);
  border-radius: 12px; padding: 14px 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,.35);
  font-size: 14px;
}
.snotes-pop h3 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.snotes-row { display: flex; gap: 8px; align-items: flex-start; }
.snotes-row + .snotes-row { margin-top: 10px; }
.snotes-text {
  flex: 1; min-height: 84px; resize: vertical; line-height: 1.5;
  background: var(--dsw-alias-fill-input, rgba(255,255,255,.04));
  color: inherit; border: 1px solid var(--dsw-alias-line-primary, #333);
  border-radius: 8px; padding: 8px 10px; font: inherit;
}
.snotes-text:focus { outline: none; border-color: var(--dsw-alias-brand-primary, #4d6bfe); }
.snotes-col { display: flex; flex-direction: column; gap: 6px; }
.snotes-btn {
  border: 1px solid var(--dsw-alias-line-primary, #333); border-radius: 8px;
  background: transparent; color: inherit; padding: 4px 10px; cursor: pointer; font: inherit;
}
.snotes-btn:hover { background: var(--dsw-alias-fill-hover, rgba(255,255,255,.06)); }
.snotes-btn.primary { border-color: var(--dsw-alias-brand-primary, #4d6bfe); color: var(--dsw-alias-brand-primary, #6b83ff); }
.snotes-btn.danger:hover { border-color: #e5534b; color: #e5534b; }
.snotes-status { font-size: 12px; opacity: .7; min-height: 16px; margin-top: 6px; }
.snotes-colors { display: flex; gap: 6px; }
.snotes-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.snotes-dot.sel { border-color: var(--dsw-alias-label-primary, #fff); }
.snotes-dot.default { background: #8a8f98; }
.snotes-dot.amber { background: #d29922; }
.snotes-dot.rose { background: #e5534b; }
.snotes-dot.sky { background: #539bf5; }
.snotes-dot.lime { background: #57ab5a; }
.snotes-switch { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; opacity: .9; }
.snotes-divider { border: none; border-top: 1px solid var(--dsw-alias-line-primary, #333); margin: 12px 0; }
.snotes-list { display: flex; flex-direction: column; gap: 6px; }
.snotes-item {
  display: flex; gap: 8px; align-items: center; text-align: left; width: 100%;
  background: transparent; border: 1px solid var(--dsw-alias-line-primary, #333);
  border-radius: 8px; padding: 8px 10px; color: inherit; cursor: pointer; font: inherit;
}
.snotes-item:hover { background: var(--dsw-alias-fill-hover, rgba(255,255,255,.06)); }
.snotes-item .snotes-item-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snotes-item .snotes-item-title { font-weight: 600; margin-right: 6px; }
.snotes-item-workspace {
  display: inline-block; max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  vertical-align: middle; margin-right: 6px; padding: 1px 6px; border-radius: 6px;
  font-size: 11px; opacity: 0.75;
  background: var(--dsw-specific-fill-tertiary, rgba(128,128,128,0.18));
}
.snotes-flag { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.snotes-flag.default { background: #8a8f98; }
.snotes-flag.amber { background: #d29922; }
.snotes-flag.rose { background: #e5534b; }
.snotes-flag.sky { background: #539bf5; }
.snotes-flag.lime { background: #57ab5a; }
.snotes-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 6px 14px; font-size: 13px;
  border-top: 1px solid var(--dsw-alias-line-primary, #333);
  background: var(--dsw-specific-sidebar-fill, transparent);
  color: var(--dsw-alias-label-secondary, #aaa);
}
.snotes-bar .snotes-bar-workspace {
  flex: none; max-width: 7em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 1px 6px; border-radius: 6px; font-size: 11px; opacity: 0.85;
  background: var(--dsw-specific-fill-tertiary, rgba(128,128,128,0.18));
}
.snotes-bar .snotes-bar-title {
  flex: none; max-width: 11em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.snotes-bar .snotes-bar-text {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--dsw-alias-label-primary, #ddd); cursor: pointer;
}
.snotes-bar .snotes-bar-text:hover { text-decoration: underline; }
.snotes-mini {
  border: none; background: transparent; color: inherit; cursor: pointer;
  padding: 2px 6px; border-radius: 6px; font: inherit; flex: none;
}
.snotes-mini:hover { background: var(--dsw-alias-fill-hover, rgba(255,255,255,.06)); }
.snotes-mini.ok { color: #57ab5a; }
`;
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.querySelector('style[data-plugin-css="dsh-session-notes"]') !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-session-notes";
  tag.dataset.pluginCss = "dsh-session-notes";
  tag.textContent = css;
  document.head.appendChild(tag);
}

// lazyrookie/dsh-session-notes/src/client/locales.ts
var NS = "session-notes";
var zh = {
  "header.open": "\u{1F4DD} \u5907\u6CE8",
  "edit.title": "\u672C\u4F1A\u8BDD\u5907\u6CE8",
  "edit.placeholder": "\u7ED9\u8FD9\u4E2A\u4F1A\u8BDD\u5199\u70B9\u5907\u6CE8\uFF1A\u60F3\u8BB0\u4F4F\u7684\u63D0\u793A\u8BED\u3001\u7ED3\u8BBA\u3001\u5F85\u529E\u2026",
  "edit.save": "\u4FDD\u5B58",
  "edit.saved": "\u5DF2\u4FDD\u5B58 \u2713",
  "edit.copy": "\u590D\u5236",
  "edit.copied": "\u5DF2\u590D\u5236 \u2713",
  "edit.delete": "\u5220\u9664",
  "edit.empty": "\uFF08\u6682\u65E0\u5907\u6CE8\uFF09",
  "bar.toggle": "\u663E\u793A\u5E95\u90E8\u5907\u6CE8\u680F",
  "all.title": "\u5168\u90E8\u5907\u6CE8",
  "all.empty": "\u8FD8\u6CA1\u6709\u4EFB\u4F55\u5907\u6CE8\u3002\u5199\u4E0B\u7B2C\u4E00\u6761\uFF0C\u4E4B\u540E\u4ECE\u8FD9\u91CC\u76F4\u8FBE\u3002",
  "all.open": "\u6253\u5F00",
  "bar.label": "\u5907\u6CE8",
  "bar.add": "\uFF0B \u7ED9\u672C\u4F1A\u8BDD\u52A0\u5907\u6CE8",
  "error.load": "\u5907\u6CE8\u52A0\u8F7D\u5931\u8D25",
  "error.save": "\u4FDD\u5B58\u5931\u8D25"
};
var en = {
  "header.open": "\u{1F4DD} Notes",
  "edit.title": "Note for this session",
  "edit.placeholder": "Write a note for this session: prompts, conclusions, todos\u2026",
  "edit.save": "Save",
  "edit.saved": "Saved \u2713",
  "edit.copy": "Copy",
  "edit.copied": "Copied \u2713",
  "edit.delete": "Delete",
  "edit.empty": "(no note yet)",
  "bar.toggle": "Show bottom notes bar",
  "all.title": "All notes",
  "all.empty": "No notes yet. Write the first one, then jump back from here.",
  "all.open": "Open",
  "bar.label": "Note",
  "bar.add": "\uFF0B Add a note for this session",
  "error.load": "Failed to load notes",
  "error.save": "Failed to save"
};
var dictionaries = { zh, en };

// lazyrookie/dsh-session-notes/src/client/ui.tsx
var import_react2 = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var ROW_TITLE_CHARS = 8;
var ROW_PREVIEW_CHARS = 15;
var ROW_WORKSPACE_CHARS = 5;
function useFlash(ms = 1500) {
  const [on, setOn] = (0, import_react2.useState)(false);
  const timer = (0, import_react2.useRef)(void 0);
  (0, import_react2.useEffect)(() => () => {
    if (timer.current !== void 0) window.clearTimeout(timer.current);
  }, []);
  const fire = () => {
    setOn(true);
    if (timer.current !== void 0) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setOn(false);
    }, ms);
  };
  return [on, fire];
}
function CopyButton(props) {
  const [copied, flash] = useFlash();
  const cls = copied ? "snotes-mini ok" : props.mini === true ? "snotes-btn snotes-mini" : "snotes-btn";
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "button",
    {
      type: "button",
      className: cls,
      onClick: (e) => {
        e.stopPropagation();
        void copyText(props.text).then((ok) => {
          if (ok) flash();
        });
      },
      children: copied ? props.copiedLabel : props.label
    }
  );
}
function popoverStyle(anchor) {
  const left = Math.max(12, Math.min(anchor.left - 40, window.innerWidth - 540));
  const below = window.innerHeight - (anchor.top + anchor.height);
  if (below < 360) {
    return { left, bottom: Math.max(12, window.innerHeight - anchor.top + 8) };
  }
  return { left, top: anchor.top + anchor.height + 8 };
}
function NotesPopover(props) {
  const { sessionId, useNotes, saveNote, removeNote, saveBarEnabled, openPopover, closePopover, openSession, rows, t } = props;
  ensureStyles();
  const state = useNotes((s) => s);
  const anchor = state.popover.anchor;
  const [draft, setDraft] = (0, import_react2.useState)("");
  const [color, setColor] = (0, import_react2.useState)("default");
  const [status, setStatus] = (0, import_react2.useState)("");
  const debounce = (0, import_react2.useRef)(void 0);
  const latest = (0, import_react2.useRef)({ id: void 0, text: "", color: "default" });
  (0, import_react2.useEffect)(() => {
    if (debounce.current !== void 0) window.clearTimeout(debounce.current);
    const note = sessionId === void 0 ? void 0 : state.notes[sessionId];
    setDraft(note?.text ?? "");
    setColor(note?.color ?? "default");
    setStatus("");
    latest.current = { id: sessionId, text: note?.text ?? "", color: note?.color ?? "default" };
  }, [sessionId]);
  (0, import_react2.useEffect)(() => () => {
    if (debounce.current !== void 0) window.clearTimeout(debounce.current);
    const { id, text, color: c } = latest.current;
    if (id !== void 0 && text !== "") void saveNote(id, { text, color: c });
  }, []);
  (0, import_react2.useEffect)(() => {
    const onDown = (e) => {
      const target = e.target;
      if (target !== null && typeof target.closest === "function") {
        if (target.closest(".snotes-pop") !== null) return;
        if (target.closest(".snotes-trigger") !== null) return;
      }
      closePopover();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closePopover();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [closePopover]);
  if (!state.popover.open || anchor === null) return null;
  const persist = (text, nextColor) => {
    if (sessionId === void 0) return;
    latest.current = { id: sessionId, text, color: nextColor };
    if (debounce.current !== void 0) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      debounce.current = void 0;
      void saveNote(sessionId, { text, color: nextColor }).then((ok) => {
        setStatus(ok ? t("edit.saved") : t("error.save"));
        window.setTimeout(() => setStatus(""), 1500);
      });
    }, SAVE_DEBOUNCE_MS);
  };
  const currentNote = sessionId === void 0 ? void 0 : state.notes[sessionId];
  const rowsWithNotes = rows.filter((row) => row.id !== sessionId && state.notes[row.id] !== void 0);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "snotes-pop", style: popoverStyle(anchor), onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("edit.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "snotes-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "textarea",
        {
          className: "snotes-text",
          value: draft,
          placeholder: t("edit.placeholder"),
          onChange: (e) => {
            setDraft(e.target.value);
            persist(e.target.value, color);
          }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "snotes-col", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          CopyButton,
          {
            text: currentNote?.text ?? "",
            label: t("edit.copy"),
            copiedLabel: t("edit.copied")
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "snotes-btn danger",
            disabled: currentNote === void 0,
            onClick: () => {
              if (sessionId === void 0 || currentNote === void 0) return;
              if (debounce.current !== void 0) window.clearTimeout(debounce.current);
              latest.current = { id: sessionId, text: "", color };
              setDraft("");
              void removeNote(sessionId);
            },
            children: t("edit.delete")
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "snotes-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "snotes-colors", children: NOTE_COLORS.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          title: c,
          className: `snotes-dot ${c}${color === c ? " sel" : ""}`,
          onClick: () => {
            setColor(c);
            if (draft !== "" || currentNote !== void 0) persist(draft, c);
          }
        },
        c
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { flex: 1 } }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "snotes-status", children: status })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("hr", { className: "snotes-divider" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: t("all.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "snotes-list", children: [
      rowsWithNotes.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6, fontSize: 13 }, children: t("all.empty") }),
      rowsWithNotes.map((row) => {
        const note = state.notes[row.id];
        const title = row.title.length > ROW_TITLE_CHARS ? `${row.title.slice(0, ROW_TITLE_CHARS)}\u2026` : row.title;
        const preview = note.text.length > ROW_PREVIEW_CHARS ? `${note.text.slice(0, ROW_PREVIEW_CHARS)}\u2026` : note.text;
        const workspace = row.workspace === void 0 ? void 0 : row.workspace.length > ROW_WORKSPACE_CHARS ? `${row.workspace.slice(0, ROW_WORKSPACE_CHARS)}\u2026` : row.workspace;
        const hover = row.workspace === void 0 ? `${row.title} \u2014 ${note.text}` : `${row.workspace} / ${row.title} \u2014 ${note.text}`;
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            role: "button",
            tabIndex: 0,
            className: "snotes-item",
            title: hover,
            onClick: () => {
              closePopover();
              openSession(row.id);
            },
            onKeyDown: (e) => {
              if (e.key === "Enter") {
                closePopover();
                openSession(row.id);
              }
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `snotes-flag ${note.color}` }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "snotes-item-text", children: [
                workspace !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "snotes-item-workspace", children: workspace }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "snotes-item-title", children: title }),
                note.text === "" ? t("edit.empty") : preview
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                CopyButton,
                {
                  text: note.text,
                  label: t("edit.copy"),
                  copiedLabel: t("edit.copied"),
                  mini: true
                }
              )
            ]
          },
          row.id
        );
      })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "snotes-switch", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          type: "checkbox",
          checked: state.barEnabled,
          onChange: (e) => {
            void saveBarEnabled(e.target.checked);
          }
        }
      ),
      t("bar.toggle")
    ] })
  ] });
}
function NotesBar(props) {
  const { sessionId, useNotes, openPopover, t } = props;
  ensureStyles();
  const note = useNotes((s) => sessionId === void 0 ? void 0 : s.notes[sessionId]);
  if (sessionId === void 0 || note === void 0 || note.text === "") return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "snotes-bar", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `snotes-flag ${note.color}` }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { flex: "none" }, children: t("bar.label") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "span",
      {
        className: "snotes-bar-text",
        title: note.text,
        onClick: (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          openPopover({ left: rect.left, top: rect.top, height: rect.height });
        },
        children: note.text
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      CopyButton,
      {
        text: note.text,
        label: t("edit.copy"),
        copiedLabel: t("edit.copied"),
        mini: true
      }
    )
  ] });
}

// lazyrookie/dsh-session-notes/src/client/index.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var inject = ["slots", "locale", "sessions", "workspaces"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), "session-notes: dictionaries");
  const store = new Store({
    notes: {},
    barEnabled: true,
    popover: { open: false, anchor: null }
  });
  const useNotes = bindSelector(store);
  const sessions = ctx.sessions;
  void fetchSection().then((result) => {
    store.set((s) => ({ ...s, notes: result.section.notes, barEnabled: result.section.barEnabled }));
  }).catch(() => {
  });
  let sessionRows = [];
  let workspaceBySession = {};
  const projectRows = () => {
    const snapshot = sessions.list.getSnapshot();
    sessionRows = Object.values(snapshot.byId).map((row) => ({
      id: row.id,
      title: row.displayTitle ?? row.title ?? row.id.slice(0, 8),
      workspace: workspaceBySession[row.id]
    }));
  };
  projectRows();
  ctx.effect(() => sessions.list.subscribe(projectRows), "session-notes: session rows projection");
  const workspaces = ctx.workspaces;
  if (workspaces !== void 0) {
    const projectWorkspaces = () => {
      const map = {};
      for (const ws of workspaces.list.getSnapshot().items) {
        const name = ws.title ?? ws.workspaceId;
        if (name === "") continue;
        for (const id of ws.sessionIds) map[id] = name;
      }
      workspaceBySession = map;
      projectRows();
    };
    projectWorkspaces();
    ctx.effect(() => workspaces.list.subscribe(projectWorkspaces), "session-notes: workspace rows projection");
  }
  const saveNote = async (id, payload) => {
    try {
      const result = await putNote(id, payload);
      store.set((s) => ({ ...s, notes: result.notes }));
      return true;
    } catch {
      return false;
    }
  };
  const removeNote = async (id) => {
    try {
      const result = await deleteNote(id);
      store.set((s) => ({ ...s, notes: result.notes }));
      return true;
    } catch {
      return false;
    }
  };
  const saveBarEnabled = async (barEnabled) => {
    try {
      const result = await putBarEnabled(barEnabled);
      store.set((s) => ({ ...s, notes: result.section.notes, barEnabled: result.section.barEnabled }));
      return true;
    } catch {
      return false;
    }
  };
  const openPopover = (anchor) => {
    store.set((s) => ({ ...s, popover: { open: true, anchor } }));
  };
  const closePopover = () => {
    store.set((s) => s.popover.open ? { ...s, popover: { open: false, anchor: null } } : s);
  };
  const openSession = (id) => {
    try {
      sessions.open(id);
    } catch {
    }
  };
  const injected = (sessionId) => ({
    sessionId,
    useNotes,
    saveNote,
    removeNote,
    saveBarEnabled,
    openPopover,
    closePopover,
    openSession,
    sessionRows
  });
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: "session-notes",
    order: 25,
    locale: NS,
    inject: injected
  }, HeaderButtonEntry));
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
    name: "conversation.input.dock",
    id: "session-notes",
    order: 20,
    locale: NS,
    inject: injected
  }, NotesBarEntry));
}
function HeaderButtonEntry(props) {
  const { sessionId, useNotes, openPopover, closePopover, openSession, sessionRows, t, saveNote, removeNote, saveBarEnabled } = props;
  ensureStyles();
  const state = useNotes((s) => s);
  const hasNote = sessionId !== void 0 && state.notes[sessionId] !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      "button",
      {
        type: "button",
        className: "snotes-mini snotes-trigger",
        style: { position: "relative" },
        title: t("header.open"),
        onClick: (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (state.popover.open) closePopover();
          else openPopover({ left: rect.left, top: rect.top, height: rect.height });
        },
        children: [
          t("header.open"),
          hasNote && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { position: "absolute", top: 0, right: 0, width: 6, height: 6, borderRadius: "50%", background: "#57ab5a" } })
        ]
      }
    ),
    state.popover.open && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      NotesPopover,
      {
        sessionId,
        useNotes,
        saveNote,
        removeNote,
        saveBarEnabled,
        openPopover,
        closePopover,
        openSession,
        rows: sessionRows,
        t
      }
    )
  ] });
}
var BAR_WORKSPACE_CHARS = 5;
var BAR_TITLE_CHARS = 8;
var BAR_PREVIEW_CHARS = 20;
function NotesBarEntry(props) {
  const { sessionId, useNotes, sessionRows, openPopover, t } = props;
  ensureStyles();
  const note = useNotes((s) => sessionId === void 0 ? void 0 : s.notes[sessionId]);
  const barEnabled = useNotes((s) => s.barEnabled);
  if (sessionId === void 0 || note === void 0 || note.text === "" || !barEnabled) return null;
  const row = sessionRows.find((r) => r.id === sessionId);
  const rawWorkspace = row?.workspace;
  const workspace = rawWorkspace === void 0 ? void 0 : rawWorkspace.length > BAR_WORKSPACE_CHARS ? `${rawWorkspace.slice(0, BAR_WORKSPACE_CHARS)}\u2026` : rawWorkspace;
  const rawTitle = row?.title ?? sessionId;
  const title = rawTitle.length > BAR_TITLE_CHARS ? `${rawTitle.slice(0, BAR_TITLE_CHARS)}\u2026` : rawTitle;
  const preview = note.text.length > BAR_PREVIEW_CHARS ? `${note.text.slice(0, BAR_PREVIEW_CHARS)}\u2026` : note.text;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "snotes-bar snotes-trigger", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: `snotes-flag ${note.color}` }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { style: { flex: "none" }, children: t("bar.label") }),
    workspace !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "snotes-bar-workspace", title: rawWorkspace, children: workspace }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "snotes-bar-title", title: rawTitle, children: title }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "span",
      {
        className: "snotes-bar-text",
        title: note.text,
        onClick: (e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          openPopover({ left: rect.left, top: rect.top, height: rect.height });
        },
        children: preview
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "button",
      {
        type: "button",
        className: "snotes-mini",
        onClick: (e) => {
          e.stopPropagation();
          copyText(note.text);
        },
        children: t("edit.copy")
      }
    )
  ] });
}

  return module.exports;
} });
