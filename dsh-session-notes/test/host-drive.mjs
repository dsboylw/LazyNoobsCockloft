/** Drive the deployed host bundle's route directly to reproduce the save failure. */
const LIB = 'file:///C:/Users/dsboylw/AppData/Roaming/dsh-desktop/harness/profiles/web/node_modules/@deepseek-ai/dsh-session-notes/lib/index.js'

const mod = await import(LIB)
console.log('exports:', Object.keys(mod).join(','))

let stored = {}
const schema = (v) => mod.validateSection(v)
const scope = {
  get: () => schema(stored),
  replace: async (s) => { stored = JSON.parse(JSON.stringify(schema(s))) },
}
let route = null
mod.apply({ inject: (svcs, fn) => fn({ settings: { register: (ns) => scope }, webServer: { register: (r) => { route = r } } }) })
console.log('route:', route !== null ? route.path : 'NOT REGISTERED')

function put(id, body) {
  return new Promise((resolve) => {
    const chunks = [Buffer.from(JSON.stringify(body))]
    const req = {
      method: 'PUT',
      url: `/plugins/dsh-session-notes/api/notes/${id}`,
      on(ev, fn) { if (ev === 'data') chunks.forEach(fn); if (ev === 'end') fn(); return req },
      destroy() {},
    }
    const res = { writeHead() {}, end(t) { resolve(JSON.parse(t)) } }
    route.handler(req, res)
  })
}

const a = await put('abc-123', { text: 'hello world' })
console.log('PUT simple:', JSON.stringify(a))
const b = await put('abc-123', { text: '中文备注测试', color: 'amber' })
console.log('PUT chinese+color:', JSON.stringify(b))
const c = await put('abc-123', {})
console.log('PUT empty body:', JSON.stringify(c))
console.log('final stored:', JSON.stringify(stored).slice(0, 300))
