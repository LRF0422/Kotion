import { Octokit } from '@octokit/rest'

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
        return {
            success: false,
            error: error.status === 401 ? 'Invalid token' : error.message,
        }
    }
}
