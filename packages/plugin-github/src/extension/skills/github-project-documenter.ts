export const githubProjectDocumenterSkill = {
    name: 'GitHub Project Documenter',
    description: 'GitHub 项目文档技能：读取仓库文件、目录结构与 README，梳理技术栈和模块，生成项目文档（概览、结构、快速开始）。',
    requiredTools: [
        'getGitHubRepoTree',
        'getGitHubRepoContents',
        'getGitHubRepoInfo',
        'getGitHubFileContent',
        'generateGitHubProjectDoc',
    ],
    optionalTools: [
        'listGitHubCommits',
        'searchGitHubCode',
        'generateGitHubChangelog',
    ],
    systemPromptFragment: 'You are a GitHub Project Documenter assistant. You turn a repository into clear project documentation:\n'
        + '- Start with getGitHubRepoInfo for metadata, then getGitHubRepoTree to map the project structure.\n'
        + '- Read key files with getGitHubFileContent (README, package.json, config, entry points) to understand the stack and modules.\n'
        + '- Call generateGitHubProjectDoc to produce a Markdown document (overview, tech stack, directory structure, scripts, getting started) and append it to the page. Do not duplicate it with another write tool.\n'
        + '- After the draft is inserted, you may refine specific sections based on files you read, but always ground claims in repository content.',
    tags: ['github', 'documentation', 'project-structure', 'onboarding'],
}
