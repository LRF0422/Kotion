import { Octokit } from '@octokit/rest'
import { describeGitHubError } from './github-errors'

let octokitInstance: Octokit | null = null
let currentToken: string = ''

export function getOctokit(token: string): Octokit {
    if (octokitInstance && currentToken === token) {
        return octokitInstance
    }
    currentToken = token
    octokitInstance = new Octokit({ auth: token })
    return octokitInstance
}

export function resetOctokit(): void {
    octokitInstance = null
    currentToken = ''
}

export async function testConnection(token: string): Promise<{ success: boolean; login?: string; error?: string }> {
    try {
        const octokit = new Octokit({ auth: token })
        const { data } = await octokit.users.getAuthenticated()
        return { success: true, login: data.login }
    } catch (error: any) {
        return { success: false, error: describeGitHubError(error) }
    }
}

export interface RepoWriteAccess {
    success: boolean
    /** Whether the token can create/update releases in this repository. */
    canPush: boolean
    /** Effective permission level: admin | maintain | write | triage | read | none */
    permission?: string
    isPrivate?: boolean
    error?: string
}

/**
 * Check whether the token has write access to a repository. Release publishing
 * (create/update/delete/tag/assets) requires write, so this lets the settings
 * UI warn before the user hits a mid-publish 403.
 */
export async function checkRepoWriteAccess(
    token: string,
    owner: string,
    repo: string,
): Promise<RepoWriteAccess> {
    try {
        const octokit = new Octokit({ auth: token })
        const { data } = await octokit.repos.get({ owner, repo })
        const permissions = (data as any).permissions || {}
        const canPush = permissions.push === true || permissions.admin === true || permissions.maintain === true
        const permission = permissions.admin
            ? 'admin'
            : permissions.maintain
                ? 'maintain'
                : permissions.push
                    ? 'write'
                    : permissions.triage
                        ? 'triage'
                        : permissions.pull
                            ? 'read'
                            : 'none'
        return { success: true, canPush, permission, isPrivate: Boolean((data as any).private) }
    } catch (error: any) {
        return { success: false, canPush: false, error: describeGitHubError(error) }
    }
}
