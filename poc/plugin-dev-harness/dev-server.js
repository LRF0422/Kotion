/**
 * PoC dev server: a Vite-style dev server for a plugin package.
 *
 *  - serves the plugin UMD bundle at http://localhost:4200/plugin.js
 *  - serves a shim that injects the host runtime (React, __KN__) from the shell
 *    origin, which is how a real plugin dev server would hand the bundle its
 *    externals
 *  - simulates an author edit + rebuild via POST /bump, then tells the shell to
 *    reload (a real implementation uses a WebSocket; file watching lives here)
 *  - a broken build is served as an error script instead of crashing the host
 */
import http from 'node:http'

let version = 1
let broken = false

const html = (body) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>dev plugin</title></head>
<body><div id="root"></div>
<script crossorigin src="${'http://localhost:4199/vendor/react.js'}"></script>
<script crossorigin src="${'http://localhost:4199/vendor/react-dom.js'}"></script>
<script>window.__KN__ = window.parent.__KN__;</script>
${body}
</body></html>`

const bundle = (v) =>
  broken
    ? `/* broken build */ this is not javascript !!! ${v}`
    : `
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? factory(exports, require('react'))
    : typeof define === 'function' && define.amd
      ? define(['exports', 'react'], factory)
      : (global = typeof globalThis !== 'undefined' ? globalThis : global || self,
         factory((global['poc-dev-plugin'] = {}), global.React));
})(this, function (exports, React) {
  'use strict';
  var h = React.createElement;
  var VERSION = ${v};
  window.__POC_MARKER = 'built-at-' + VERSION;

  function PocDevPanel() {
    var s = React.useState(0);
    return h('div', { style: { padding: 16, fontFamily: 'sans-serif' } },
      h('h3', null, 'PoC dev plugin v' + VERSION),
      h('p', null, 'live panel inside the host window, rendered by host React ' + React.version),
      h('button', { onClick: function () { s[1](s[0] + 1) } }, 'clicked ' + s[0])
    );
  }

  var plugin = {
    name: 'poc-dev-plugin',
    status: 'active',
    dockPanels: [{ id: 'poc-dev-panel', title: 'PoC Dev', icon: null, component: PocDevPanel }]
  };
  exports.pocDevPlugin = plugin;
  exports.__esModule = true;

  if (typeof window !== 'undefined' && window.__KN__ && window.__KN__.definePlugin) {
    ['poc-dev-plugin', 'pocdevplugin', 'dev-plugin', 'poc-dev'].forEach(function (key) {
      window.__KN__.definePlugin(key, exports, {
        apiVersion: '2.1.0',
        packageName: 'poc-dev-plugin'
      });
    });
  }
});
`

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:4200')

  if (url.pathname === '/bump') {
    // simulate: author edited src/index.tsx -> HMR triggered a rebuild
    version += 1
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify({ reloads: version }))
    console.log(`[dev-server] rebuilt plugin -> v${version}`)
    return
  }

  if (url.pathname === '/break') {
    broken = !broken
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ broken }))
    return
  }

  if (url.pathname === '/plugin.js') {
    // `?broken=1` simulates a failed build for that request only (a real dev
    // server returns a 500 / error overlay for the failed module).
    const isBroken = broken || url.searchParams.get('broken') === '1'
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    res.end(isBroken ? `/* broken build */ this is not javascript !!!` : bundle(version))
    return
  }

  if (url.pathname === '/preview') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' })
    res.end(html(`<script src="./plugin.js"></script>`))
    return
  }

  if (url.pathname.startsWith('/vendor/')) {
    // vendor React is served by the shell in this PoC; the preview page just
    // needs the shell's React to be reachable, which it is (same window).
    res.writeHead(200, { 'Content-Type': 'application/javascript' })
    res.end('/* vendor handled by the shell origin */')
    return
  }

  res.writeHead(404)
  res.end('not found')
})

server.listen(4200, () => console.log('[dev-server] plugin dev server on http://localhost:4200'))
