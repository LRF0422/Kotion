import { KPlugin, PluginConfig } from '@kn/common'
import { GitHubExtension } from './extension'
import { GitHubSettings } from './components/GitHubSettings'
import { Github } from '@kn/icon'
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
        icon: React.createElement(Github, { className: 'h-4 w-4' }),
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
                },
            },
        },
    },
})

export { GitHubExtension } from './extension'
