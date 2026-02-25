import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor'
import { GitHubIssueCard } from '../../components/GitHubIssueCard'

export const GitHubIssueNode = Node.create({
    name: 'githubIssue',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            owner: { default: '' },
            repo: { default: '' },
            issueNumber: { default: 0 },
            title: { default: '' },
            state: { default: '' },
            labels: { default: [] },
            assignees: { default: [] },
            commentsCount: { default: 0 },
            authorLogin: { default: '' },
            authorAvatar: { default: '' },
            htmlUrl: { default: '' },
            createdAt: { default: '' },
            updatedAt: { default: '' },
            lastSyncAt: { default: '' },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="github-issue"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'github-issue' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(GitHubIssueCard)
    },
})
