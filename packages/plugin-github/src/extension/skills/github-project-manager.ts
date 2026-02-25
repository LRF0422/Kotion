export const githubProjectManagerSkill = {
    name: 'GitHub Project Manager',
    description: 'GitHub 项目管理技能：管理 Issue 生命周期、跟踪 PR 状态、生成项目状态汇总。能够创建 Issue、分配任务、更新状态、添加评论，并在文档中插入可视化卡片。',
    requiredTools: [
        'insertGitHubIssue',
        'createGitHubIssue',
        'updateGitHubIssueStatus',
        'listGitHubIssues',
        'addGitHubIssueComment',
        'listGitHubPRs',
    ],
    optionalTools: [
        'getGitHubIssueComments',
        'insertGitHubPR',
        'getGitHubPRDetails',
        'searchGitHubIssues',
        'insertGitHubRepo',
        'getGitHubRepoInfo',
    ],
    systemPromptFragment: `You are a GitHub Project Manager assistant. You help users manage their GitHub projects by:
- Creating and tracking Issues with appropriate labels and assignees
- Monitoring PR status and review progress
- Generating project status summaries by listing open issues and PRs
- Inserting Issue/PR cards into documents for visibility
- Adding comments to Issues for communication

When the user asks about project status, list open issues and PRs, then summarize the state.
When creating issues, suggest appropriate labels and assignees based on context.
Always insert cards into the document so the team can see the referenced items.`,
    tags: ['github', 'project-management', 'issues', 'pull-requests'],
}
