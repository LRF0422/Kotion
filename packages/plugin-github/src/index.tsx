import { KPlugin, PluginConfig } from '@kn/common'
import { GitHubExtension } from './extension'
import { GitHubSettings } from './components/GitHubSettings'
import { GitHubMark } from './components/GitHubLogo'
import React from 'react'

interface GitHubPluginConfig extends PluginConfig {}

class GitHubPlugin extends KPlugin<GitHubPluginConfig> {}

export const github = new GitHubPlugin({
    status: 'ACTIVE',
    name: 'GitHub',
    editorExtension: [GitHubExtension],
    settings: {
        key: 'github-settings',
        label: 'GitHub',
        description: 'Configure GitHub integration (PAT, default repo, cache)',
        icon: React.createElement(GitHubMark, { className: 'h-4 w-4' }),
        component: GitHubSettings,
    },
    locales: {
        zh: {
            translation: {
                github: {
                    title: 'GitHub',
                    description: 'GitHub 集成',
                    'insert-issue': '插入 Issue',
                    'insert-pr': '插入 Pull Request',
                    'insert-repo': '插入仓库',
                    'insert-code': '插入代码片段',
                    'insert-release': '插入 Release',
                    'release-publish': '发布 Release',
                    'release-draft': '保存草稿',
                    'release-generate-notes': '生成 Release Notes',
                },
            },
        },
        en: {
            translation: {
                github: {
                    title: 'GitHub',
                    description: 'GitHub Integration',
                    'insert-issue': 'Insert Issue',
                    'insert-pr': 'Insert Pull Request',
                    'insert-repo': 'Insert Repository',
                    'insert-code': 'Insert Code Snippet',
                    'insert-release': 'Insert Release',
                    'release-publish': 'Publish Release',
                    'release-draft': 'Save Draft',
                    'release-generate-notes': 'Generate Release Notes',
                },
            },
        },
    },
})

export { GitHubExtension } from './extension'
export { GitHubLogo, GitHubMark } from './components/GitHubLogo'
export type { GitHubLogoProps, GitHubMarkProps } from './components/GitHubLogo'
export { GitHubReleaseCard } from './components/GitHubReleaseCard'
export type { GitHubPluginConfig } from './types/config'
export { DEFAULT_GITHUB_CONFIG } from './types/config'
export * from './types/github'
export {
    listReleases,
    listTags,
    getLatestRelease,
    getReleaseById,
    getReleaseByTag,
    generateReleaseNotes,
    resolveReleaseNotes,
    isReleaseNotesPermissionError,
    createRelease,
    updateRelease,
    deleteRelease,
    createTag,
    uploadReleaseAsset,
    deleteReleaseAsset,
    invalidateReleaseCache,
} from './services/github-release-service'
export { releaseTools } from './extension/tools/release-tools'
export { githubReleaseManagerSkill } from './extension/skills/github-release-manager'
export { describeGitHubError, isPermissionError } from './services/github-errors'
export { checkRepoWriteAccess } from './services/github-client'
export type { RepoWriteAccess } from './services/github-client'
