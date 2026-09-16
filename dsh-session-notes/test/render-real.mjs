// 用真实 React 18.3.1（壳内）+ react-dom/server 跑 NotesPopover 真渲染——
// renderToStaticMarkup 会真实执行函数体+hooks，抛错原样浮出。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const SHELL = 'E:/DSH Desktop/resources/app/node_modules'
const require2 = createRequire(import.meta.url)
const React = require2(`${SHELL}/react`)
const { renderToStaticMarkup } = require2(`${SHELL}/react-dom/server`)

let loaded = null
globalThis.window = { __ModuleLoader__: { load(def) { loaded = def } } }
const SHELL2 = 'E:/DSH Desktop/resources/app/node_modules/react/jsx-runtime'
const realJsxRuntime = require2(SHELL2)
// 真实方案：jsx-runtime 直接用壳内的真实现——bundle 里的 jsx() 产出真 React 元素
const jsxStub = {}
const reactShim = { ...React, Fragment: React.Fragment }
const req = (name) => {
  if (name === 'react') return reactShim
  if (name === 'react/jsx-runtime') return realJsxRuntime
  if (name === 'react-dom') return {}
  throw new Error('unexpected require: ' + name)
}
const shim = new Proxy(function require(name) { return req(name) }, { get(t, p) { if (p === 'resolve') return (n) => n; return t[p] } })

const wrapper = readFileSync('C:/Users/dsboylw/AppData/Roaming/dsh-desktop/harness/profiles/web/node_modules/@deepseek-ai/dsh-session-notes/lib/client.js', 'utf8')
new Function('window', 'require', wrapper)(globalThis.window, shim)
const mod = loaded.factory(shim)

const r = await fetch('http://127.0.0.1:43129/plugins/dsh-session-notes/api/settings')
const j = await r.json()
const storeData = { notes: j.section.notes, barEnabled: true, popover: { open: true, anchor: { left: 100, top: 100, height: 30 }, source: 'bar' }, selectedNoteId: undefined, pickerOpen: false }
const ctx = {
  slots: { inject: (s, f) => { f() }, register: () => {} },
  locale: { register: () => {} },
  sessions: { list: { getSnapshot: () => ({ byId: { 'session-7ed1930b-4cef-41f3-8886-04d8b550a72f': { id: 'session-7ed1930b-4cef-41f3-8886-04d8b550a72f', displayTitle: 'T' } } }), subscribe: () => {} }, open: () => {} },
  workspaces: undefined,
  effect: (fn) => fn(),
}
mod.apply(ctx)
globalThis.document = { querySelector: () => null, createElement: () => ({ style: {}, dataset: {} }), head: { appendChild: () => {} } }
const t = (k) => k
const el = React.createElement(mod.NotesPopover, {
  sessionId: 'session-7ed1930b-4cef-41f3-8886-04d8b550a72f',
  useNotes: (sel) => sel(storeData),
  saveNote: async () => true, addNote: async () => true, recolorNote: async () => true, pinSession: async () => true,
  selectNote: () => {}, setPickerOpen: () => {}, removeNote: async () => true, saveBarEnabled: async () => true,
  openPopover: () => {}, closePopover: () => {}, openSession: () => {},
  rows: [{ id: 'session-7ed1930b-4cef-41f3-8886-04d8b550a72f', title: 'T' }],
  t,
})
try {
  const html = renderToStaticMarkup(el)
  console.log('✅ 真实 React 渲染成功，HTML 长度:', html.length)
  console.log('含 title-row:', html.includes('snotes-title-row'), '| 含 seq:', html.includes('snotes-item-seq'))
} catch (e) {
  console.log('🔴 真实 React 渲染抛错:', e.message)
  console.log(e.stack?.split('\n').slice(0, 6).join('\n'))
}
