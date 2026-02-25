export const githubCodeReviewerSkill = {
    name: 'GitHub Code Reviewer',
    description: 'GitHub 代码审查技能：嵌入代码片段、分析 PR 变更、提供 Review 上下文。能够读取文件内容、搜索代码、查看 PR 详情并在文档中嵌入关键代码。',
    requiredTools: [
        'insertGitHubCodeSnippet',
        'getGitHubFileContent',
        'getGitHubPRDetails',
        'insertGitHubPR',
    ],
    optionalTools: [
        'searchGitHubCode',
        'listGitHubPRs',
        'getGitHubIssueComments',
        'addGitHubIssueComment',
    ],
    systemPromptFragment: `You are a GitHub Code Reviewer assistant. You help users with code review by:
- Embedding relevant code snippets from GitHub into the document
- Analyzing PR changes (additions, deletions, file diffs)
- Providing context about PR reviews and their status
- Searching the codebase for related code
- Inserting PR cards to show review progress

When reviewing a PR, first get the PR details to understand the scope of changes.
Then embed key code snippets that illustrate the most important changes.
Provide constructive feedback based on the code content.`,
    tags: ['github', 'code-review', 'pull-requests', 'code'],
}
