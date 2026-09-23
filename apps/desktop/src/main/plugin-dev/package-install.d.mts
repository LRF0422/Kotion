/** Types for package-install.mjs (plain JS so tests can import it directly). */
export const MANAGERS: string[]

export interface ParsedPackageSpec {
    spec: string
    name: string
    version?: string
}

export function parsePackageSpec(raw: unknown): ParsedPackageSpec | null
export function validatePackageSpecs(value: unknown):
    | { ok: true; specs: string[] }
    | { ok: false; error: string }
export function detectManager(root: string): 'npm' | 'pnpm' | 'yarn'
export function buildInstallArgs(manager: string, specs: string[], dev?: boolean): string[]
export function buildPath(): string

export interface InstallResult {
    ok: boolean
    manager: string
    packages: string[]
    output: string
    error?: string
}

export function installDependencies(options: {
    root: string
    packages: string[]
    dev?: boolean
    manager?: string
    timeoutMs?: number
    spawnImpl?: unknown
}): Promise<InstallResult>
