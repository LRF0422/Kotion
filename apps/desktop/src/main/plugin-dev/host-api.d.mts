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

export interface HostApiDeclaration {
    symbol: string
    package: string
    path: string
    startLine: number
    endLine: number
    totalLines: number
    text: string
}

export interface HostApiMember {
    member: string
    startLine: number
    endLine: number
    totalLines: number
    text: string
}

export interface HostApiQueryOptions {
    package?: string
    path?: string
    query?: string
    limit?: number
    symbol?: string
    symbols?: string[]
    members?: string[]
}

export type HostApiQueryResult =
    | { kind: 'list'; root: string; packages: HostPackageEntry[] }
    | { kind: 'search'; matches: HostApiMatch[]; truncated: boolean }
    | {
          kind: 'file'
          package: string
          path: string
          contents: string
          bytes: number
          symbol?: string
          startLine?: number
          endLine?: number
          totalLines?: number
      }
    | { kind: 'declarations'; declarations: HostApiDeclaration[]; missing: string[] }
    | { kind: 'contract'; package: string; path: string; entries: HostApiMember[]; missing: string[] }

export function resolveWorkspaceRoot(candidates?: Array<string | undefined>): string | undefined
export function listHostPackages(root: string): HostPackageEntry[]
export function searchHostPackages(
    root: string,
    options?: { package?: string; query?: string; limit?: number },
): Promise<{ matches: HostApiMatch[]; truncated: boolean }>
export function readHostPackageFile(
    root: string,
    options?: { package?: string; path?: string; symbol?: string },
): Promise<{
    package: string
    path: string
    contents: string
    bytes: number
    symbol?: string
    startLine?: number
    endLine?: number
    totalLines?: number
}>
export function findDeclaration(
    contents: string,
    symbol: string,
): { startLine: number; endLine: number; text: string; totalLines: number } | undefined
export function findInterfaceMember(
    contents: string,
    member: string,
): { startLine: number; endLine: number; text: string; totalLines: number } | undefined
export function readInterfaceMembers(
    root: string,
    options?: { package?: string; path?: string; members?: string[] },
): Promise<{ package: string; path: string; entries: HostApiMember[]; missing: string[] }>
export function readDeclarations(
    root: string,
    options?: { package?: string; path?: string; symbols?: string[] },
): Promise<{ declarations: HostApiDeclaration[]; missing: string[] }>
export function queryHostApi(
    root: string | undefined,
    options?: HostApiQueryOptions,
): Promise<HostApiQueryResult>
