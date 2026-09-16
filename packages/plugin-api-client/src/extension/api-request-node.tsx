import { PMNode as Node, mergeAttributes, ReactNodeViewRenderer } from '@kn/editor'
import { ApiRequestBlock } from '../components/ApiRequestBlock'

/**
 * Document-embedded API request block.
 *
 * Request config and the latest response snapshot live in node attributes, so
 * everything is persisted with the page itself.
 */
export const ApiRequestNode = Node.create({
    name: 'apiRequest',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            method: { default: 'GET' },
            url: { default: '' },
            headersText: { default: '' },
            bodyText: { default: '' },
            responseStatus: { default: 0 },
            responseStatusText: { default: '' },
            responseDurationMs: { default: 0 },
            responseBodyBytes: { default: 0 },
            responseBodyText: { default: '' },
            responseHeadersText: { default: '' },
            responseAt: { default: '' },
            error: { default: '' },
        }
    },

    parseHTML() {
        return [{ tag: 'div[data-type="api-request"]' }]
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'api-request' })]
    },

    addNodeView() {
        return ReactNodeViewRenderer(ApiRequestBlock)
    },
})
