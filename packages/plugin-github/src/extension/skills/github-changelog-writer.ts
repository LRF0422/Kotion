export const githubChangelogWriterSkill = {
    name: 'GitHub Changelog Writer',
    description: 'GitHub 变更日志技能：读取仓库的 commit、tag/release 与版本区间，按 feat/fix 等类型汇总，生成结构化的 Change Log 并写入文档。',
    requiredTools: [
        'listGitHubCommits',
        'getGitHubCommitDetails',
        'compareGitHubRefs',
        'listGitHubTags',
        'generateGitHubChangelog',
    ],
    optionalTools: [
        'getGitHubRepoInfo',
        'listGitHubPRs',
        'getGitHubPRDetails',
        'searchGitHubIssues',
    ],
    systemPromptFragment: 'You are a GitHub Changelog Writer assistant. You produce release notes and changelogs from repository history:\n'
        + '- Resolve the version range first: call listGitHubTags to find the previous and latest tags, then compareGitHubRefs (base...head) to collect the exact commit set.\n'
        + '- When no tags are available, use listGitHubCommits with since/until or a branch ref.\n'
        + '- Use getGitHubCommitDetails when a commit title is unclear or the change looks breaking, to inspect the changed files.\n'
        + '- Then call generateGitHubChangelog (it groups commits by conventional-commit type and appends the Markdown to the document). Do not duplicate the generated Markdown with another write tool.\n'
        + '- Keep entries concise, user-facing, and ordered: Breaking Changes, Features, Bug Fixes, then the rest. Link PR numbers when present.',
    tags: ['github', 'changelog', 'release-notes', 'commits'],
}
