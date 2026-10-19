/** Types for `secret-params.mjs`. Keep in step with the implementation. */

export const SECRET_MAX_VALUE_BYTES: number
export const SECRET_MAX_KEY_LENGTH: number
export const SECRET_MAX_NAMESPACE_LENGTH: number
export const SECRET_MAX_ENTRIES_PER_NAMESPACE: number
export const SECRET_ERROR: {
    NAMESPACE: 'SECRET_INVALID_NAMESPACE'
    KEY: 'SECRET_INVALID_KEY'
    TOO_LARGE: 'SECRET_TOO_LARGE'
    NO_KEYCHAIN: 'SECRET_NO_KEYCHAIN'
}
export class SecretParamError extends Error {
    code: string
}
export function normalizeSecretNamespace(value: unknown): string
export function normalizeSecretKey(value: unknown): string
export function normalizeSecretValue(value: unknown): string
export function secretByteLength(value: string): number
export function secretFailure(error: unknown): { ok: false; code: string; error: string }
