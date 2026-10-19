/** Types for `socket-client.mjs`. Keep in step with the implementation. */

export interface OpenedSocket {
    socket: import('node:net').Socket
    encrypted: boolean
    remoteAddress: string
    remotePort: number
    markLocalClose: (graceful: boolean) => void
}

export function openSocket(options: {
    host: string
    port: number
    protocol: 'tcp' | 'tls'
    serverName: string
    tlsMode: 'strict' | 'relaxed'
    connectTimeoutMs: number
    onData: (chunk: Buffer) => void
    onClose: (info: { local: boolean; graceful: boolean }) => void
    onError: (error: Error) => void
}): Promise<OpenedSocket>

export function writeSocket(
    socket: import('node:net').Socket | undefined,
    buffer: Buffer,
): Promise<boolean>

export function closeSocket(
    socket: import('node:net').Socket | undefined,
    options?: { graceful?: boolean; markLocalClose?: (graceful: boolean) => void },
): boolean
