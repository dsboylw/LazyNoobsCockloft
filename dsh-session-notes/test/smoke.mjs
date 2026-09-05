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

// PUT note
{
  let captured = null
  const res = await new Promise((resolve) => {
    const chunks = [Buffer.from(JSON.stringify({ text: '提示语A：分析BTC结构', color: 'amber' }))]
    const req = {
      method: 'PUT',
      url: '/plugins/dsh-session-notes/api/notes/sess-1',
      on(event, fn) {
        if (event === 'data') { for (const c of chunks) fn(c) }
        if (event === 'end') fn()
        return req
      },
      destroy() {},
    }
    const res2 = {
      writeHead(status) { captured = { status } },
      end(text) { resolve({ status: captured.status, body: text }) },
    }
    route.handler(req, res2)
  })
  assert.strictEqual(res.status, 200)
  const body = JSON.parse(res.body)
  assert.strictEqual(body.notes['sess-1'].text, '提示语A：分析BTC结构')
  assert.strictEqual(body.notes['sess-1'].color, 'amber')
}

// GET settings reflects the note
{
  const res = await drive('GET', '/settings')
  const body = JSON.parse(res.body)
  assert.strictEqual(body.section.notes['sess-1'].text, '提示语A：分析BTC结构')
}

// DELETE note
{
  const res = await new Promise((resolve) => {
    const req = {
      method: 'DELETE',
      url: '/plugins/dsh-session-notes/api/notes/sess-1',
      on() { return req },
      destroy() {},
    }
    const res2 = { writeHead() {}, end(text) { resolve({ body: text }) } }
    route.handler(req, res2)
  })
  const body = JSON.parse(res.body)
  assert.strictEqual(body.notes['sess-1'], undefined)
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
const reactStub = { useState: () => [undefined, () => {}], useEffect: () => {}, useRef: () => ({ current: undefined }), useCallback: (fn) => fn, useSyncExternalStore: () => undefined, createElement: () => null, Fragment: 'fragment', forwardRef: (fn) => fn }
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
assert.deepStrictEqual(clientModule.inject, ['slots', 'locale', 'sessions'])

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
const slots = {
  inject: (slotName, registerFactory) => { registrations.push({ slotName, registerFactory }) },
  register: (def, component) => {
    assert.strictEqual(typeof component, 'function')
    registrations[registrations.length - 1].def = def
  },
}
const locale = { register: (ns, dict) => { localeNS.push(ns); assert.ok(dict.zh && dict.en) }, bind: (ns) => (key) => key }
const clientCtx = {
  slots, locale, sessions: sessionsService,
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
  assert.strictEqual(typeof face.openSession, 'function')
  assert.strictEqual(face.sessionId, 'sess-live', 'inject face carries binding key')
  assert.ok(Array.isArray(face.sessionRows))
  assert.strictEqual(face.sessionRows.length, 2, 'projected session rows')
}
console.log('client bundle: OK')
console.log('ALL SMOKE TESTS PASSED')
