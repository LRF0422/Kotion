import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor'
import { GitHubCodeSnippet } from '../../components/GitHubCodeSnippet'

export const GitHubCodeNode = Node.create({
    name: 'githubCode',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            owner: { default: '' },
            repo: { default: '' },
            path: { default: '' },
            ref: { default: '' },
            startLine: { default: 0 },
            endLine: { default: 0 },
            content: { default: '' },
            language: { default: '' },
            htmlUrl: { default: '' },
            lastSyncAt: { default: '' },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="github-code"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'github-code' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(GitHubCodeSnippet)
    },
})
