import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor'
import { GitHubRepoCard } from '../../components/GitHubRepoCard'

export const GitHubRepoNode = Node.create({
    name: 'githubRepo',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            owner: { default: '' },
            repo: { default: '' },
            description: { default: '' },
            language: { default: '' },
            stars: { default: 0 },
            forks: { default: 0 },
            openIssues: { default: 0 },
            topics: { default: [] },
            visibility: { default: 'public' },
            htmlUrl: { default: '' },
            defaultBranch: { default: 'main' },
            lastSyncAt: { default: '' },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="github-repo"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'github-repo' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(GitHubRepoCard)
    },
})
