/** Types for project-files.mjs (plain JS so tests can import it directly). */
export interface ProjectFileMatch {
    path: string
    line: number
    text: string
}

export interface ProjectGrepLine {
    line: number
    text: string
}

export interface ProjectGrepMatch extends ProjectFileMatch {
    before: ProjectGrepLine[]
    after: ProjectGrepLine[]
}

export interface ProjectGrepCount {
    path: string
    count: number
}

export type ProjectGrepMode = 'content' | 'files_with_matches' | 'count'

export interface ProjectGrepResult {
    kind: 'grep'
    root: string
    mode: ProjectGrepMode
    pattern: string
    matches: ProjectGrepMatch[]
    files: string[]
    counts: ProjectGrepCount[]
    scanned: number
    skippedLarge: number
    truncated: boolean
    timedOut: boolean
}

export interface ProjectFilesOptions {
    query?: string
    pattern?: string
    include?: string
    ignoreCase?: boolean
    context?: number
    outputMode?: ProjectGrepMode
    limit?: number
}

export type ProjectFilesResult =
    | { kind: 'list'; root: string; files: string[]; truncated: boolean }
    | { kind: 'search'; root: string; matches: ProjectFileMatch[]; truncated: boolean }
    | ProjectGrepResult

export function listProjectFiles(
    root: string,
    options?: { include?: string; limit?: number },
): Promise<{ root: string; files: string[]; truncated: boolean }>
export function searchProjectFiles(
    root: string,
    options?: { query?: string; include?: string; limit?: number },
): Promise<{ root: string; matches: ProjectFileMatch[]; truncated: boolean }>
export function grepProjectFiles(
    root: string,
    options?: ProjectFilesOptions,
): Promise<ProjectGrepResult>
/** Compile a `*`/`**`/`?` glob into a matcher over project-relative POSIX paths. */
export function compileGlob(glob: string): RegExp | null
/** Type-check the raw `dev.files` IPC params. */
export function normalizeFilesParams(params?: Record<string, unknown>): ProjectFilesOptions
export function queryProjectFiles(
    root: string,
    options?: ProjectFilesOptions,
): Promise<ProjectFilesResult>
