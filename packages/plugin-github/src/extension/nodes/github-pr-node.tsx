import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor'
import { GitHubPRCard } from '../../components/GitHubPRCard'

export const GitHubPRNode = Node.create({
    name: 'githubPR',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            owner: { default: '' },
            repo: { default: '' },
            prNumber: { default: 0 },
            title: { default: '' },
            state: { default: '' },
            merged: { default: false },
            draft: { default: false },
            baseRef: { default: '' },
            headRef: { default: '' },
            additions: { default: 0 },
            deletions: { default: 0 },
            changedFiles: { default: 0 },
            authorLogin: { default: '' },
            authorAvatar: { default: '' },
            reviewers: { default: [] },
            htmlUrl: { default: '' },
            createdAt: { default: '' },
            updatedAt: { default: '' },
            lastSyncAt: { default: '' },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="github-pr"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'github-pr' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(GitHubPRCard)
    },
})
