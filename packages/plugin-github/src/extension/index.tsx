import { ExtensionWrapper } from '@kn/common'
import { GitHubIssueNode } from './nodes/github-issue-node'
import { GitHubPRNode } from './nodes/github-pr-node'
import { GitHubRepoNode } from './nodes/github-repo-node'
import { GitHubCodeNode } from './nodes/github-code-node'
import { issueTools } from './tools/issue-tools'
import { prTools } from './tools/pr-tools'
import { repoTools } from './tools/repo-tools'
import { codeTools } from './tools/code-tools'
import { searchTools } from './tools/search-tools'
import { githubProjectManagerSkill } from './skills/github-project-manager'
import { githubCodeReviewerSkill } from './skills/github-code-reviewer'
import { CircleDot, GitPullRequest, FolderGit2, FileCode } from '@kn/icon'
import React from 'react'

export const GitHubExtension: ExtensionWrapper = {
    name: 'github',
    extendsion: [GitHubIssueNode, GitHubPRNode, GitHubRepoNode, GitHubCodeNode],
    slashConfig: [
        {
            divider: true,
            title: 'GitHub',
        },
        {
            icon: <CircleDot className="h-4 w-4" />,
            text: 'GitHub Issue',
            slash: '/github-issue',
            action: (editor) => {
                editor.commands.insertContent({
                    type: 'githubIssue',
                    attrs: {},
                })
            },
        },
        {
            icon: <GitPullRequest className="h-4 w-4" />,
            text: 'GitHub PR',
            slash: '/github-pr',
            action: (editor) => {
                editor.commands.insertContent({
                    type: 'githubPR',
                    attrs: {},
                })
            },
        },
        {
            icon: <FolderGit2 className="h-4 w-4" />,
            text: 'GitHub Repo',
            slash: '/github-repo',
            action: (editor) => {
                editor.commands.insertContent({
                    type: 'githubRepo',
                    attrs: {},
                })
            },
        },
        {
            icon: <FileCode className="h-4 w-4" />,
            text: 'GitHub Code',
            slash: '/github-code',
            action: (editor) => {
                editor.commands.insertContent({
                    type: 'githubCode',
                    attrs: {},
                })
            },
        },
    ],
    tools: [
        ...issueTools,
        ...prTools,
        ...repoTools,
        ...codeTools,
        ...searchTools,
    ],
    skills: [
        githubProjectManagerSkill,
        githubCodeReviewerSkill,
    ],
}
