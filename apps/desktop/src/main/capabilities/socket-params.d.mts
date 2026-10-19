/** Types for `socket-params.mjs`. Keep in step with the implementation. */

export interface NormalizedSocketOptions {
    host: string
    port: number
    protocol: 'tcp' | 'tls'
    serverName: string
    tlsMode: 'strict' | 'relaxed'
    timeoutMs: number
    connectTimeoutMs: number
    label: string
}

export const SOCKET_MIN_TIMEOUT_MS: number
export const SOCKET_MAX_TIMEOUT_MS: number
export const SOCKET_DEFAULT_TIMEOUT_MS: number
export const SOCKET_MIN_CONNECT_TIMEOUT_MS: number
export const SOCKET_MAX_CONNECT_TIMEOUT_MS: number
export const SOCKET_DEFAULT_CONNECT_TIMEOUT_MS: number
export const SOCKET_MAX_WRITE_BYTES: number
export const SOCKET_MAX_SESSIONS: number
export const SOCKET_ERROR: Record<string, string>
export class SocketParamError extends Error {
    code: string
}
export function normalizeSocketHost(value: unknown): string
export function normalizeSocketPort(value: unknown): number
export function normalizeSocketProtocol(value: unknown): 'tcp' | 'tls'
export function normalizeTlsMode(value: unknown): 'strict' | 'relaxed'
export function normalizeServerName(value: unknown, fallbackHost: string): string
export function normalizeSocketLabel(value: unknown, host: string, port: number): string
export function normalizeSocketOpenOptions(raw: unknown): NormalizedSocketOptions
export function normalizeSocketWritePayload(value: unknown): Buffer
export function normalizeSessionId(value: unknown): string
export function socketErrorMessage(host: string, port: number, error: unknown): string
