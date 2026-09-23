/** Types for project-files.mjs (plain JS so tests can import it directly). */
export interface ProjectFileMatch {
    path: string
    line: number
    text: string
}

export type ProjectFilesResult =
    | { kind: 'list'; root: string; files: string[]; truncated: boolean }
    | { kind: 'search'; root: string; matches: ProjectFileMatch[]; truncated: boolean }

export function listProjectFiles(
    root: string,
    options?: { include?: string; limit?: number },
): Promise<{ root: string; files: string[]; truncated: boolean }>
export function searchProjectFiles(
    root: string,
    options?: { query?: string; include?: string; limit?: number },
): Promise<{ root: string; matches: ProjectFileMatch[]; truncated: boolean }>
export function queryProjectFiles(
    root: string,
    options?: { query?: string; include?: string; limit?: number },
): Promise<ProjectFilesResult>
