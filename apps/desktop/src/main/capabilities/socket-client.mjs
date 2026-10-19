/**
 * TCP / TLS connection primitives for `net.socket.*` (main process).
 *
 * The host is a transport: it connects, moves bytes both ways and reports
 * open/data/close/error. It knows nothing about the protocol on top — that is
 * the plugin's business, which is exactly why there is no `mail.*` capability
 * anywhere in this file.
 *
 * Two decisions worth stating out loud:
 *
 *   - **Verification is on by default.** `strict` is plain `tls.connect` with
 *     `rejectUnauthorized: true`, i.e. the OS/Chromium root store plus Node's
 *     own hostname check for the SNI name. `relaxed` turns the chain check off
 *     but keeps encryption on; it exists for a self-signed dev server and has to
 *     be asked for explicitly.
 *   - **Nothing is spooled.** Bytes are forwarded to the renderer as they
 *     arrive; the main process keeps no replay buffer, so a plugin that stops
 *     reading cannot grow host memory without bound (backpressure is the
 *     kernel's, and mis-reading the stream is the plugin's problem).
 */

import { connect as connectTcp } from 'node:net'
import { connect as connectTls } from 'node:tls'

const noop = () => {}

/**
 * Open one TCP or TLS connection.
 *
 * Resolves once the socket is connected — for TLS, once the handshake *and* the
 * certificate check have both succeeded — with a small handle that owns the
 * socket's close intent, so `onClose` can say whether the local side asked for
 * it and whether it was orderly.
 *
 * @param {{
 *   host: string, port: number, protocol: 'tcp'|'tls', serverName: string,
 *   tlsMode: 'strict'|'relaxed', connectTimeoutMs: number,
 *   onData: (chunk: Buffer) => void,
 *   onClose: (info: { local: boolean, graceful: boolean }) => void,
 *   onError: (error: Error) => void,
 * }} options
 * @returns {Promise<{ socket: import('node:net').Socket, encrypted: boolean, remoteAddress: string, remotePort: number, markLocalClose: (graceful: boolean) => void }>}
 */
export function openSocket(options) {
    return new Promise((resolve, reject) => {
        let settled = false
        /** @type {import('node:net').Socket | undefined} */
        let socket
        /** Local close was requested, so `close` is not news from the peer. */
        let localClose = false
        /** `end()` (orderly) rather than `destroy()` (abort). */
        let graceful = false

        const timer = setTimeout(() => {
            finish(new Error(`connect timed out after ${options.connectTimeoutMs}ms`))
        }, options.connectTimeoutMs)
        timer.unref?.()

        const finish = (error) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (error) {
                // An error before the caller ever saw a session must not emit
                // `socket-error` for a session it does not know about; hand it
                // back as a rejection of `open` instead.
                try {
                    socket?.destroy()
                } catch {
                    /* already gone */
                }
                reject(error)
                return
            }
            if (socket) {
                resolve({
                    socket,
                    encrypted: options.protocol === 'tls',
                    remoteAddress: socket.remoteAddress || options.host,
                    remotePort: socket.remotePort || options.port,
                    markLocalClose: (orderly) => {
                        localClose = true
                        graceful = Boolean(orderly)
                    },
                })
            }
        }

        try {
            socket =
                options.protocol === 'tls'
                    ? connectTls({
                          host: options.host,
                          port: options.port,
                          servername: options.serverName,
                          rejectUnauthorized: options.tlsMode === 'strict',
                          // `strict` keeps Node's own hostname check (aligned with
                          // the SNI name above), so the option is left absent —
                          // passing an explicit `undefined` trips an internal
                          // assertion instead of falling back to the default.
                          // `relaxed` deliberately skips the hostname check.
                          ...(options.tlsMode === 'strict'
                              ? {}
                              : { checkServerIdentity: () => undefined }),
                      })
                    : connectTcp({ host: options.host, port: options.port })
        } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)))
            return
        }

        socket.setNoDelay(true)
        socket.on('data', (chunk) => {
            if (!settled) return
            options.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        socket.on('error', (error) => {
            if (!settled) {
                finish(error instanceof Error ? error : new Error(String(error)))
                return
            }
            options.onError(error instanceof Error ? error : new Error(String(error)))
        })
        socket.on('close', (hadError) => {
            if (!settled) {
                finish(new Error('connection closed during setup'))
                return
            }
            options.onClose({ local: localClose, graceful: graceful && !hadError })
        })
        // `connect` for TCP, `secureConnect` for TLS: the latter is the point at
        // which the certificate has actually been verified.
        socket.once(options.protocol === 'tls' ? 'secureConnect' : 'connect', () => finish(undefined))
    })
}

/**
 * Write a chunk and resolve once it is flushed to the kernel. A socket that has
 * gone away answers `false` rather than throwing, so a plugin racing a close
 * gets a straight answer instead of an unhandled rejection.
 *
 * @param {import('node:net').Socket | undefined} socket
 * @param {Buffer} buffer
 * @returns {Promise<boolean>}
 */
export function writeSocket(socket, buffer) {
    return new Promise((resolve) => {
        if (!socket || socket.destroyed || !socket.writable) {
            resolve(false)
            return
        }
        try {
            socket.write(buffer, (error) => resolve(!error))
        } catch {
            resolve(false)
        }
    })
}

/**
 * Close a socket. `graceful` half-closes (`end`, letting the remote finish) so a
 * protocol can send `LOGOUT` and still read the goodbye; the default is a hard
 * destroy.
 *
 * @param {import('node:net').Socket | undefined} socket
 * @param {{ graceful?: boolean, markLocalClose?: (graceful: boolean) => void }} [options]
 */
export function closeSocket(socket, options = {}) {
    if (!socket) return false
    options.markLocalClose?.(Boolean(options.graceful))
    try {
        if (options.graceful && !socket.destroyed && socket.writable) {
            socket.end(noop)
            // Do not leave a half-open socket behind forever: abort after 5s.
            const timer = setTimeout(() => {
                try {
                    socket.destroy()
                } catch {
                    /* already gone */
                }
            }, 5000)
            timer.unref?.()
            socket.once('close', () => clearTimeout(timer))
        } else {
            socket.destroy()
        }
        return true
    } catch {
        return false
    }
}
