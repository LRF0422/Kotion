import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor'
import { GitHubReleaseCard } from '../../components/GitHubReleaseCard'

export const GitHubReleaseNode = Node.create({
    name: 'githubRelease',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            owner: { default: '' },
            repo: { default: '' },
            tagName: { default: '' },
            releaseName: { default: '' },
            body: { default: '' },
            draft: { default: false },
            prerelease: { default: false },
            targetCommitish: { default: '' },
            htmlUrl: { default: '' },
            publishedAt: { default: '' },
            activeTab: { default: 'publish' },
            collapsed: { default: false },
            lastSyncAt: { default: '' },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="github-release"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'github-release' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(GitHubReleaseCard)
    },
})
