import { KPlugin, PluginConfig, liftLegacyTools, liftLegacySkills } from '@kn/common'
import { GitHubExtension } from './extension'
import { issueTools } from './extension/tools/issue-tools'
import { prTools } from './extension/tools/pr-tools'
import { repoTools } from './extension/tools/repo-tools'
import { codeTools } from './extension/tools/code-tools'
import { searchTools } from './extension/tools/search-tools'
import { historyTools } from './extension/tools/history-tools'
import { structureTools } from './extension/tools/structure-tools'
import { releaseTools } from './extension/tools/release-tools'
import { githubProjectManagerSkill } from './extension/skills/github-project-manager'
import { githubCodeReviewerSkill } from './extension/skills/github-code-reviewer'
import { githubChangelogWriterSkill } from './extension/skills/github-changelog-writer'
import { githubProjectDocumenterSkill } from './extension/skills/github-project-documenter'
import { githubReleaseManagerSkill } from './extension/skills/github-release-manager'
import { GitHubSettings } from './components/GitHubSettings'
import { GitHubMark } from './components/GitHubLogo'
import React from 'react'

interface GitHubPluginConfig extends PluginConfig {}

class GitHubPlugin extends KPlugin<GitHubPluginConfig> {}

export const github = new GitHubPlugin({
    status: 'ACTIVE',
    name: 'GitHub',
    editorExtension: [GitHubExtension],
    /**
     * Plugin agent (docs/plugin-agents.md): GitHub capabilities belong to this
     * agent's child run — the kernel no longer sees them in its flat catalog.
     *
     * Scope is `page` because several tools write the document
     * (insertGitHubIssue / createGitHubIssue / insertGitHubPR / insertGitHubRepo /
     * insertGitHubCodeSnippet / generateGitHubChangelog / generateGitHubProjectDoc /
     * generateGitHubReleaseNotes / createGitHubRelease / publishGitHubRelease).
     * liftLegacyTools requires a live editor for every lifted factory, so the
     * read-only tools cannot be split into a second `any` agent without
     * advertising tools that fail in a workspace run.
     */
    agent: {
        agents: [
            {
                id: 'github-ops',
                name: 'GitHub 运营助手',
                description: '负责 GitHub 日常运营：查询仓库、代码、提交历史和 Issue/PR 状态，创建或更新 Issue、审查 PR、生成 changelog 或项目文档，以及创建 tag、发布和维护 Release。当用户需要读取 GitHub 仓库信息，或需要把 Issue/PR/代码/Release 卡片、变更日志、项目文档写入当前页面时，委派给它。',
                scope: 'page',
                systemPrompt: '你是 GitHub 运营助手，通过 GitHub API 处理 Issue、PR、仓库、代码、提交历史和 Release 工作流。你只能操作当前打开的页面（插入卡片、追加 Markdown），不得越权修改其他页面、空间或仓库设置。动手前先用只读工具（list/get/search/compare）核对 owner、repo、编号和版本区间，写操作必须有明确目标。发布、删除 Release 或覆盖已存在的 tag 之前，必须先向用户确认。完成后用一段话汇报执行的操作、改动的对象、在文档中插入或追加的内容，以及 GitHub 返回的警告（例如 generate-notes 权限不足时的回退）。',
                tools: liftLegacyTools([
                    ...issueTools,
                    ...prTools,
                    ...repoTools,
                    ...codeTools,
                    ...searchTools,
                    ...historyTools,
                    ...structureTools,
                    ...releaseTools,
                ], { scope: 'page' }),
                skills: liftLegacySkills([
                    githubProjectManagerSkill,
                    githubCodeReviewerSkill,
                    githubChangelogWriterSkill,
                    githubProjectDocumenterSkill,
                    githubReleaseManagerSkill,
                ]),
            },
        ],
    },
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
                    release: {
                        tabPublish: '发布',
                        tabEdit: '编辑 Release',
                        tabReleases: '版本',
                        readOnly: '只读模式：编辑文档后才能发布 release。',
                        noToken: '未配置 Personal Access Token，请前往 设置 → GitHub 配置后即可发布。',
                        tag: 'Tag',
                        target: '目标分支 / commit',
                        detectedPrevious: '检测到上一版本：',
                        title: 'Release 标题',
                        notes: 'Release notes',
                        notesAuto: '自动 (GitHub)',
                        notesAutoHint: 'GitHub 原生 generate-notes，按合并的 PR 自动生成',
                        notesCommits: 'Commits',
                        notesCommitsHint: '基于 commit 的 changelog',
                        notesCustom: '自定义',
                        notesCustomHint: '使用下方自定义内容',
                        notesNone: '无',
                        notesNoneHint: '留空',
                        generate: '生成',
                        notesGenerated: 'Release notes 已生成。',
                        enterTagFirst: '请先填写 tag 名称。',
                        tagRequired: 'Tag 名称为必填项。',
                        createTagFirst: '先创建 git tag',
                        createTagFirstHint: '在创建 release 前显式创建附注 tag',
                        tagMessagePlaceholder: '附注 tag 消息（可选）',
                        assetsTitle: 'Release 产物',
                        addFromFileManager: '从文件管理器添加',
                        uploadFromFileManager: '从文件管理器上传',
                        assets: '产物',
                        assetsFor: '产物 · {{tag}}',
                        assetsHint: '可从文件管理器选择构建产物（zip、jar、dmg、exe 等），保存 release 时自动上传。',
                        noAssetsUpload: '暂无产物，可从文件管理器上传构建产物。',
                        noAssetsSelect: '暂无产物，可从文件管理器选择文件上传。',
                        draft: '草稿',
                        draftHint: '保存为草稿，暂不公开',
                        prerelease: '预发布',
                        prereleaseHint: '标记为预发布版本',
                        makeLatest: '设为最新',
                        makeLatestDefault: '默认',
                        makeLatestTrue: '设为最新',
                        makeLatestFalse: '不设为最新',
                        makeLatestLegacy: 'Legacy',
                        cancelEdit: '取消编辑',
                        updateRelease: '更新 Release',
                        saveDraft: '保存草稿',
                        publishRelease: '发布 Release',
                        loadingReleases: '正在加载 Release…',
                        noReleases: '还没有 Release，用「发布」标签创建第一个。',
                        noReleaseNotes: '暂无 release notes。',
                        copyNotes: '复制 notes',
                        publishDraft: '发布草稿',
                        editRelease: '编辑 Release',
                        deleteRelease: '删除 Release',
                        deleteConfirm: '删除 Release {{tag}}？该操作不可撤销。',
                        refresh: '刷新',
                        openOnGitHub: '在 GitHub 打开',
                        removeCard: '移除卡片',
                        collapseCard: '折叠卡片',
                        expandCard: '展开卡片',
                        collapse: '折叠',
                        expand: '展开',
                        copied: '已复制到剪贴板。',
                        updated: 'Release {{tag}} 已更新。',
                        notesSuffix: '（notes：{{gen}}）',
                        savedDraft: 'Release {{tag}} 已保存为草稿。',
                        published: 'Release {{tag}} 已发布！',
                        publishedDraft: 'Release {{tag}} 已正式发布。',
                        deleted: 'Release {{tag}} 已删除。',
                        assetsUploaded: '已上传 {{count}} 个产物。',
                        assetsUploadedFromFM: '已从文件管理器上传 {{count}} 个产物：{{names}}',
                        assetsUploadFailed: '部分产物上传失败：{{details}}',
                        fileManagerUnavailable: '文件管理器不可用，请确认 File Manager 插件已启用。',
                        selectUploadTitle: '选择要上传到 {{tag}} 的产物',
                        selectAssetsTitle: '选择要作为 release 产物的文件',
                        unreadableFile: '无法读取文件内容',
                        desktopOnlyNotice: '上传 release 产物需要桌面端。',
                        latest: '最新',
                    },
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
                    release: {
                        tabPublish: 'Publish',
                        tabEdit: 'Edit release',
                        tabReleases: 'Releases',
                        readOnly: 'Read-only: edit the document to publish releases.',
                        noToken: 'No Personal Access Token. Configure it in Settings → GitHub to publish.',
                        tag: 'Tag',
                        target: 'Target branch / commit',
                        detectedPrevious: 'detected previous:',
                        title: 'Release title',
                        notes: 'Release notes',
                        notesAuto: 'Auto (GitHub)',
                        notesAutoHint: 'GitHub native generate-notes, grouped by merged PRs',
                        notesCommits: 'Commits',
                        notesCommitsHint: 'Commit-based changelog',
                        notesCustom: 'Custom',
                        notesCustomHint: 'Use the content below',
                        notesNone: 'None',
                        notesNoneHint: 'Leave empty',
                        generate: 'Generate',
                        notesGenerated: 'Release notes generated.',
                        enterTagFirst: 'Enter a tag first.',
                        tagRequired: 'Tag name is required.',
                        createTagFirst: 'Create git tag first',
                        createTagFirstHint: 'Create an annotated tag before publishing',
                        tagMessagePlaceholder: 'Tag message (optional, creates annotated tag)',
                        assetsTitle: 'Release assets',
                        addFromFileManager: 'Add from File Manager',
                        uploadFromFileManager: 'Upload from File Manager',
                        assets: 'Assets',
                        assetsFor: 'Assets · {{tag}}',
                        assetsHint: 'Pick build artifacts (zip, jar, dmg, exe, …) from the File Manager; they upload when the release is saved.',
                        noAssetsUpload: 'No assets yet. Upload build artifacts from the File Manager.',
                        noAssetsSelect: 'No assets yet. Pick files from the File Manager to upload.',
                        draft: 'Draft',
                        draftHint: 'Save as a draft, not public yet',
                        prerelease: 'Pre-release',
                        prereleaseHint: 'Mark as a pre-release',
                        makeLatest: 'Make latest',
                        makeLatestDefault: 'Default',
                        makeLatestTrue: 'Set as latest',
                        makeLatestFalse: 'Not latest',
                        makeLatestLegacy: 'Legacy',
                        cancelEdit: 'Cancel edit',
                        updateRelease: 'Update release',
                        saveDraft: 'Save draft',
                        publishRelease: 'Publish release',
                        loadingReleases: 'Loading releases…',
                        noReleases: 'No releases yet. Use the Publish tab to create the first one.',
                        noReleaseNotes: 'No release notes.',
                        copyNotes: 'Copy notes',
                        publishDraft: 'Publish draft',
                        editRelease: 'Edit release',
                        deleteRelease: 'Delete release',
                        deleteConfirm: 'Delete release {{tag}}? This cannot be undone.',
                        refresh: 'Refresh',
                        openOnGitHub: 'Open on GitHub',
                        removeCard: 'Remove card',
                        collapseCard: 'Collapse card',
                        expandCard: 'Expand card',
                        collapse: 'Collapse',
                        expand: 'Expand',
                        copied: 'Copied to clipboard.',
                        updated: 'Release {{tag}} updated.',
                        notesSuffix: ' (notes: {{gen}})',
                        savedDraft: 'Release {{tag}} saved as draft.',
                        published: 'Release {{tag}} published!',
                        publishedDraft: 'Release {{tag}} published.',
                        deleted: 'Release {{tag}} deleted.',
                        assetsUploaded: 'Uploaded {{count}} asset(s).',
                        assetsUploadedFromFM: 'Uploaded {{count}} asset(s) from File Manager: {{names}}',
                        assetsUploadFailed: 'Some assets failed: {{details}}',
                        fileManagerUnavailable: 'File Manager is unavailable. Make sure the File Manager plugin is enabled.',
                        selectUploadTitle: 'Select files to upload to {{tag}}',
                        selectAssetsTitle: 'Select files to attach as release assets',
                        unreadableFile: 'Could not read file content',
                        desktopOnlyNotice: 'Uploading release assets requires the desktop app.',
                        latest: 'Latest',
                    },
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
