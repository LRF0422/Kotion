/** PoC shell server: mimics the host app origin (dev: http://localhost:5173,
 *  prod: app://.). It also exposes the host runtime that plugin bundles resolve
 *  their externals from — the same trick the real host uses to keep one React. */
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:4199')

  if (url.pathname === '/vendor/react.js' || url.pathname === '/vendor/react-dom.js') {
    const name = url.pathname.endsWith('react.js') ? 'react' : 'react-dom'
    try {
      const file = join(here, '..', '..', 'node_modules', name, 'umd', `${name}.development.js`)
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(readFileSync(file))
    } catch (error) {
      res.writeHead(500)
      res.end('vendored ' + name + ' not found: ' + String(error.message))
    }
    return
  }

  const file = url.pathname === '/' ? '/index.html' : url.pathname
  try {
    const body = readFileSync(join(here, 'shell', file))
    const type = file.endsWith('.js') ? 'application/javascript' : 'text/html'
    res.writeHead(200, { 'Content-Type': type })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

server.listen(4199, () => console.log('[shell] host shell on http://localhost:4199'))
