/**
 * Smoke test for dsh-session-notes build artifacts.
 * 1. Host bundle: stub settings+webServer services, run apply(), drive the
 *    route handler through GET/PUT/DELETE flows.
 * 2. Client bundle: stub window.__ModuleLoader__ + require(react...) and load
 *    the wrapped factory, then run apply() with stub slots/locale/sessions.
 */
import { createRequire } from 'node:module'
import assert from 'node:assert'
import { pathToFileURL } from 'node:url'

const LIB = 'C:/Users/dsboylw/AppData/Roaming/dsh-desktop/harness/profiles/web/node_modules/@deepseek-ai/dsh-session-notes/lib'

// ---------- 1. host ----------
const host = await import(pathToFileURL(`${LIB}/index.js`).href)

let stored = {}
let registered = null
const settingsService = {
  register(ns, schema) {
    assert.strictEqual(ns, 'dsh-session-notes', 'namespace')
    assert.strictEqual(typeof schema, 'function', 'schema callable')
    assert.strictEqual(typeof schema.toJSON, 'function', 'schema toJSON')
    return {
      get: () => schema(stored),
      replace: async (section) => { stored = JSON.parse(JSON.stringify(schema(section))) },
      update: async (patch) => { stored = { ...stored, ...patch } },
    }
  },
}
let route = null
const webServer = { register(r) { route = r } }
const hostCtx = {
  inject(services, fn) {
    assert.deepStrictEqual(services, ['settings', 'webServer'])
    fn({ settings: settingsService, webServer })
  },
}
host.apply(hostCtx)
assert.ok(route !== null, 'route registered')
assert.strictEqual(route.kind, 'prefix')
assert.strictEqual(route.path, '/plugins/dsh-session-notes/api')

function drive(method, subpath, body) {
  return new Promise((resolve) => {
    let result = null
    let settled = false
    const finish = (r) => { if (!settled) { settled = true; resolve(r) } }
    const res = {
      writeHead(status, headers) { result = { ...(result ?? {}), status, headers } },
      end(text) { result = { ...(result ?? {}), body: text }; finish(result) },
    }
    if (body !== undefined) {
      const chunks = [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
      route.handler(
        {
          method,
          url: `/plugins/dsh-session-notes/api${subpath}`,
          on(event, fn) {
            if (event === 'data') { for (const c of chunks) fn(c) }
            if (event === 'end') fn()
          },
          destroy() { finish({ status: 0, body: 'destroyed' }) },
        },
        res,
      )
    } else {
      route.handler(
        { method, url: `/plugins/dsh-session-notes/api${subpath}`, on() {}, destroy() { finish({ status: 0, body: 'destroyed' }) } },
        res,
      )
    }
  })
}

// GET settings (empty)
{
  const res = await drive('GET', '/settings')
  assert.strictEqual(res.status, 200)
  const body = JSON.parse(res.body)
  assert.strictEqual(body.ok, true)
  assert.deepStrictEqual(body.section, { notes: {}, barEnabled: true })
}

// 0.3.0 legacy migration: a 0.2.x-shaped record (no sessionId) keeps working
{
  stored = { notes: { 'sess-legacy': { text: '旧会话备注', color: 'sky', pinned: false, updated: 1 } }, barEnabled: true }
  const res = await drive('GET', '/settings')
  const body = JSON.parse(res.body)
  assert.strictEqual(body.section.notes['sess-legacy'].sessionId, 'sess-legacy', 'legacy note migrates sessionId = key')
  assert.strictEqual(body.section.notes['sess-legacy'].text, '旧会话备注')
}

// 0.3.0 multi-note: PUT with explicit sessionId creates a second note for the same session
{
  const put = (key, payload) => new Promise((resolve) => {
    const chunks = [Buffer.from(JSON.stringify(payload))]
    const req = {
      method: 'PUT',
      url: `/plugins/dsh-session-notes/api/notes/${encodeURIComponent(key)}`,
      on(event, fn) {
        if (event === 'data') { for (const c of chunks) fn(c) }
        if (event === 'end') fn()
        return req
      },
      destroy() {},
    }
    const res2 = { writeHead() {}, end(text) { resolve(JSON.parse(text)) } }
    route.handler(req, res2)
  })
  const r1 = await put('n-a1', { sessionId: 'sess-1', text: '提示语A：分析BTC结构', color: 'amber' })
  assert.strictEqual(r1.notes['n-a1'].sessionId, 'sess-1', 'new note carries sessionId from payload')
  const r2 = await put('n-a2', { sessionId: 'sess-1', text: '提示语B：输出JSON', color: 'lime' })
  assert.strictEqual(r2.notes['n-a2'].sessionId, 'sess-1')
  assert.strictEqual(Object.values(r2.notes).filter((n) => n.sessionId === 'sess-1').length, 2, 'two notes bound to sess-1')
  // legacy PUT to a session key (no sessionId field) keeps 0.2.x semantics
  const r3 = await put('sess-1', { text: '旧式单条备注' })
  assert.strictEqual(r3.notes['sess-1'].sessionId, 'sess-1', 'legacy PUT binds sessionId = key')
  // 0.3.0 empty draft: a new note persisted with empty text SURVIVES validation
  // (user is mid-typing) — this is what makes the ＋ button work
  const r4 = await put('n-a3', { sessionId: 'sess-1', text: '', color: 'default' })
  assert.strictEqual(r4.notes['n-a3'].sessionId, 'sess-1', 'empty 0.3.0 draft survives')
  assert.strictEqual(r4.notes['n-a3'].text, '')
  // legacy empty PUT still deletes (0.2.x semantics intact)
  const r5 = await put('sess-legacy-2', { text: 'temp' })
  assert.ok(r5.notes['sess-legacy-2'] !== undefined)
  const r6 = await put('sess-legacy-2', { text: '' })
  assert.strictEqual(r6.notes['sess-legacy-2'], undefined, 'legacy empty PUT still deletes')
  // 0.3.1 pin-only PUT must NOT bump `updated` (stable list order)
  const before = r2.notes['n-a2']
  const r7 = await put('n-a2', { pinned: !before.pinned })
  assert.strictEqual(r7.notes['n-a2'].pinned, !before.pinned, 'pin toggled')
  assert.strictEqual(r7.notes['n-a2'].updated, before.updated, 'pin-only keeps updated (order stable)')
  const r8 = await put('n-a2', { pinned: before.pinned })
  assert.strictEqual(r8.notes['n-a2'].updated, before.updated, 'unpin also keeps updated')
  // 0.3.2 seq assignment: new notes take max(seq in session) + 1
  const r9 = await put('n-a4', { sessionId: 'sess-1', text: '第四条', color: 'default' })
  const prevSeqs = [r1.notes['n-a1'], r2.notes['n-a2'], r3.notes['sess-1'], r4.notes['n-a3']].map((n) => n.seq ?? 0)
  assert.strictEqual(r9.notes['n-a4'].seq, Math.max(...prevSeqs) + 1, 'seq = session max + 1')
  // 0.3.2 session recolor: PUT /notes/session:<sid> paints all session notes
  const recolor = await new Promise((resolve) => {
    const chunks = [Buffer.from(JSON.stringify({ color: 'rose' }))]
    const req = {
      method: 'PUT',
      url: '/plugins/dsh-session-notes/api/notes/session%3Asess-1',
      on(event, fn) { if (event === 'data') { for (const c of chunks) fn(c) } if (event === 'end') fn(); return req },
      destroy() {},
    }
    const res2 = { writeHead() {}, end(text) { resolve(JSON.parse(text)) } }
    route.handler(req, res2)
  })
  const sess1 = Object.values(recolor.notes).filter((n) => n.sessionId === 'sess-1')
  assert.ok(sess1.length >= 2, 'session has notes to recolor')
  assert.ok(sess1.every((n) => n.color === 'rose'), 'recolor paints every session note')
}

// GET settings reflects the notes
{
  const res = await drive('GET', '/settings')
  const body = JSON.parse(res.body)
  assert.strictEqual(body.section.notes['n-a1'].text, '提示语A：分析BTC结构')
}

// DELETE note
{
  const res = await new Promise((resolve) => {
    const req = {
      method: 'DELETE',
      url: '/plugins/dsh-session-notes/api/notes/n-a2',
      on() { return req },
      destroy() {},
    }
    const res2 = { writeHead() {}, end(text) { resolve({ body: text }) } }
    route.handler(req, res2)
  })
  const body = JSON.parse(res.body)
  assert.strictEqual(body.notes['n-a2'], undefined)
}

// unknown route 404
{
  const res = await drive('GET', '/nope')
  assert.strictEqual(res.status, 404)
}

console.log('host bundle: OK')

// ---------- 2. client ----------
let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(def) { loaded = def },
  },
}
class StubComponent {}
const reactStub = { useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: undefined }), useCallback: (fn) => fn, useSyncExternalStore: () => undefined, createElement: () => null, Fragment: 'fragment', forwardRef: (fn) => fn, Component: StubComponent }
const jsxStub = { jsx: () => null, jsxs: () => null, Fragment: 'fragment' }
const req = (name) => {
  if (name === 'react') return reactStub
  if (name === 'react/jsx-runtime') return jsxStub
  if (name === 'react-dom') return {}
  throw new Error(`unexpected require: ${name}`)
}
const requireShim = new Proxy(function require(name) { return req(name) }, {
  // the esbuild CJS interop may probe require.resolve / require properties
  get(target, prop) {
    if (prop === 'resolve') return (name) => name
    return target[prop]
  },
})

// load the wrapper file text and run it with our require
const { readFileSync } = await import('node:fs')
const wrapper = readFileSync(`${LIB}/client.js`, 'utf8')
// execute in this realm: window + require are provided
const run = new Function('window', 'require', wrapper)
run(globalThis.window, requireShim)
assert.ok(loaded !== null, 'ModuleLoader.load called')
assert.strictEqual(loaded.id, '@deepseek-ai/dsh-session-notes')
assert.strictEqual(typeof loaded.factory, 'function')

const clientModule = loaded.factory(requireShim)
assert.strictEqual(typeof clientModule.apply, 'function', 'client apply export')
assert.deepStrictEqual(clientModule.inject, ['slots', 'locale', 'sessions', 'workspaces'])

// drive client apply with stub services
const registrations = []
const localeNS = []
const effects = []
let openCalls = []
const sessionsService = {
  list: {
    getSnapshot: () => ({ byId: { a: { id: 'a', displayTitle: '会话A' }, b: { id: 'b', displayTitle: '会话B' } } }),
    subscribe: (fn) => { effects.push(fn); return () => {} },
  },
  open: (id) => { openCalls.push(id) },
}
const workspacesService = {
  list: {
    getSnapshot: () => ({ items: [{ workspaceId: 'ws1', title: '大项目工作区', sessionIds: ['a'] }] }),
    subscribe: (fn) => { effects.push(fn); return () => {} },
  },
}
const slots = {
  inject: (slotName, registerFactory) => { registrations.push({ slotName, registerFactory }) },
  register: (def, component) => {
    assert.strictEqual(typeof component, 'function')
    registrations[registrations.length - 1].def = def
  },
}
const locale = { register: (ns, dict) => { localeNS.push(ns); assert.ok(dict.zh && dict.en) }, bind: (ns) => (key) => key }
const clientCtx = {
  slots, locale, sessions: sessionsService, workspaces: workspacesService,
  effect: (fn, label) => { effects.push(fn()) },
}
clientModule.apply(clientCtx)
const slotNames = registrations.map((r) => r.slotName)
assert.ok(slotNames.includes('conversation.session.header.actions'), 'header actions slot')
assert.ok(slotNames.includes('conversation.input.dock'), 'composer dock slot')
assert.ok(localeNS.includes('session-notes'), 'locale registered')
for (const r of registrations) {
  if (r.def === undefined) continue // outer inject rows carry no def (slot not registered yet)
  assert.strictEqual(r.def.locale, 'session-notes')
  // the renderer calls inject(binding.key, actions) — face must carry sessionId
  const face = r.def.inject('sess-live')
  assert.strictEqual(typeof face.useNotes, 'function')
  assert.strictEqual(typeof face.saveNote, 'function')
  assert.strictEqual(typeof face.addNote, 'function', '0.3.0 addNote action')
  assert.strictEqual(typeof face.selectNote, 'function', '0.3.0 selectNote action')
  assert.strictEqual(typeof face.setPickerOpen, 'function', '0.3.0 setPickerOpen action')
  assert.strictEqual(typeof face.openSession, 'function')
  assert.strictEqual(face.sessionId, 'sess-live', 'inject face carries binding key')
  assert.ok(Array.isArray(face.sessionRows))
  assert.strictEqual(face.sessionRows.length, 2, 'projected session rows')
  assert.strictEqual(face.sessionRows.find((r) => r.id === 'a').workspace, '大项目工作区', 'workspace projected onto row')
  assert.strictEqual(face.sessionRows.find((r) => r.id === 'b').workspace, undefined, 'stray session has no workspace')
}
console.log('client bundle: OK')
console.log('ALL SMOKE TESTS PASSED')
