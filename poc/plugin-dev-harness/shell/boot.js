/* PoC shell: replicates how the host app boots and hot-reloads remote plugins.
 * Uses the REAL @kn/common PluginScriptLoader (bundled by esbuild). */
import { pluginScriptLoader } from './loader.bundle.js'

const registry = new Map()
const listeners = new Set()

window.__KN__ = Object.freeze({
  hostApiVersion: '2.1.0',
  definePlugin(packageName, exports, meta) {
    registry.set(packageName, { exports, meta: meta || {} })
    listeners.forEach((fn) => fn(packageName))
  },
  getPlugin(packageName) {
    return registry.get(packageName)
  },
  findPlugin(packageName) {
    return registry.get(packageName)
  },
})

/* A backend/marketplace-shaped descriptor. In the real app this is exactly what
 * PluginDetail / Marketplace pass to pluginManager.installPlugin():
 * an absolute URL plus a versionId. */
const descriptor = {
  pluginKey: 'poc-dev-plugin',
  name: 'poc-dev-plugin',
  resourcePath:
    'http://localhost:4200/plugin.js?_t=' + Date.now(),
  versionId: 'dev',
}

const waitFor = (key, timeout = 8000) =>
  new Promise((resolve, reject) => {
    if (registry.has(key)) return resolve()
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + key)), timeout)
    const off = (name) => {
      if (name === key) {
        clearTimeout(t)
        listeners.delete(off)
        resolve()
      }
    }
    listeners.add(off)
  })

let reloads = 0
let observed = []

async function run() {
  // 1) install: latest bundle, bypassing any cache (hot-reload path uses this)
  await pluginScriptLoader.load(descriptor.resourcePath, descriptor.pluginKey, descriptor.name, {
    bustCache: true,
  })
  await waitFor(descriptor.pluginKey)
  const first = registry.get(descriptor.pluginKey).exports.version
  const firstMarker = window.__POC_MARKER
  const firstApiVersion = registry.get(descriptor.pluginKey).meta.apiVersion
  observed.push({ phase: 'install', version: first, marker: firstMarker, apiVersion: firstApiVersion })

  // 2) EDIT the plugin on the dev server, then hot-reload the way
  //    PluginManager does: clearPluginCache() -> load again.
  const res = await fetch('http://localhost:4200/bump', { mode: 'cors' })
  reloads = (await res.json()).reloads
  await new Promise((r) => setTimeout(r, 150))

  pluginScriptLoader.invalidateAll()
  await pluginScriptLoader.load(descriptor.resourcePath, descriptor.pluginKey, descriptor.name, {
    bustCache: true,
    timeout: 5000,
  })
  await waitFor(descriptor.pluginKey, 2000)
  observed.push({
    phase: 'hot-reload',
    version: registry.get(descriptor.pluginKey).exports.version,
    marker: window.__POC_MARKER,
    reloads,
  })

  // 3) desktop capability smoke test (fs write through the bridge contract)
  let fsResult = 'skipped'
  try {
    const bridge = window.knDesktop
    if (bridge && bridge.invoke) {
      await bridge.invoke('fs.writeFile', {
        path: '/tmp/kn-plugin-dev-poc.txt',
        content: 'written by plugin at ' + new Date().toISOString(),
      })
      fsResult = await bridge.invoke('fs.readFile', { path: '/tmp/kn-plugin-dev-poc.txt' })
    } else {
      fsResult = 'no bridge'
    }
  } catch (error) {
    fsResult = 'error: ' + String(error && error.message)
  }

  return { observed, fsResult, platform: navigator.platform }
}

run()
  .then((result) => {
    console.log('POC_RESULT ' + JSON.stringify(result))
    document.title = 'done'
  })
  .catch((error) => {
    console.log('POC_ERROR ' + String((error && error.stack) || error))
    document.title = 'error'
  })
