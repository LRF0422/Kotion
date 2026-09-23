/* Failure-isolation check: a plugin bundle that 404s or fails to build must
 * reject the host's load() rather than hang it, and later loads must recover. */
import { pluginScriptLoader } from './loader.bundle.js'

const results = []
const t0 = Date.now()

// 1) broken artifact on the dev server (build error served as invalid JS)
try {
  await pluginScriptLoader.load(
    'http://localhost:4200/plugin.js?broken=1',
    'poc-dev-plugin',
    'poc-dev-plugin',
    { bustCache: true, timeout: 3000 },
  )
  results.push('broken-build: unexpectedly loaded')
} catch (error) {
  results.push('broken-build rejected after ' + (Date.now() - t0) + 'ms: ' + String(error.message).slice(0, 60))
}

// 2) missing artifact (404) must also reject
const t1 = Date.now()
try {
  await pluginScriptLoader.load('http://localhost:4200/does-not-exist.js', 'nope', 'nope', {
    bustCache: true,
    timeout: 3000,
  })
  results.push('404: unexpectedly loaded')
} catch (error) {
  results.push('404 rejected after ' + (Date.now() - t1) + 'ms')
}

// 3) recovery: dev server serves a good build again
try {
  const registration = await pluginScriptLoader.load(
    'http://localhost:4200/plugin.js',
    'poc-dev-plugin',
    'poc-dev-plugin',
    { bustCache: true, timeout: 3000 },
  )
  results.push('recovered, registered=' + Boolean(registration) + ', marker=' + window.__POC_MARKER)
} catch (error) {
  results.push('recovery failed: ' + String(error.message))
}

console.log('POC_FAILURE_RESULT ' + JSON.stringify(results))
