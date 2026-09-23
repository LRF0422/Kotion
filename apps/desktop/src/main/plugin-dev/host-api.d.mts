/** Types for host-api.mjs (plain JS so tests and the child bundle can import it). */
export const HOST_PACKAGE_DIRS: string[]

export interface HostPackageEntry {
    name: string
    version?: string
    root: string
    entry?: string
}

export interface HostApiMatch {
    package: string
    path: string
    line: number
    text: string
}

export type HostApiQueryResult =
    | { kind: 'list'; root: string; packages: HostPackageEntry[] }
    | { kind: 'search'; matches: HostApiMatch[]; truncated: boolean }
    | { kind: 'file'; package: string; path: string; contents: string; bytes: number }

export function resolveWorkspaceRoot(candidates?: Array<string | undefined>): string | undefined
export function listHostPackages(root: string): HostPackageEntry[]
export function searchHostPackages(
    root: string,
    options?: { package?: string; query?: string; limit?: number },
): Promise<{ matches: HostApiMatch[]; truncated: boolean }>
export function readHostPackageFile(
    root: string,
    options?: { package?: string; path?: string },
): Promise<{ package: string; path: string; contents: string; bytes: number }>
export function queryHostApi(
    root: string | undefined,
    options?: { package?: string; path?: string; query?: string; limit?: number },
): Promise<HostApiQueryResult>
