/** Notes surface styles (single injected stylesheet, dsw CSS variables). */

const css = `
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
`

/** Inject the stylesheet once. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin-css="dsh-session-notes"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-session-notes'
  tag.dataset.pluginCss = 'dsh-session-notes'
  tag.textContent = css
  document.head.appendChild(tag)
}
