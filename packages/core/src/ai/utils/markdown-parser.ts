/**
 * Parse Markdown to ProseMirror-compatible JSON nodes
 */
export const parseMarkdownToNodes = (markdown: string): any[] => {
    const nodes: any[] = []
    const lines = markdown.split('\n')
    let inCodeBlock = false
    let codeContent: string[] = []
    let codeLanguage = ''

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Code block handling
        if (line.startsWith('```')) {
            if (!inCodeBlock) {
                inCodeBlock = true
                codeLanguage = line.slice(3).trim()
                codeContent = []
            } else {
                inCodeBlock = false
                nodes.push({
                    type: 'codeBlock',
                    attrs: { language: codeLanguage || 'text' },
                    content: codeContent.length > 0
                        ? [{ type: 'text', text: codeContent.join('\n') }]
                        : undefined
                })
            }
            continue
        }

        if (inCodeBlock) {
            codeContent.push(line)
            continue
        }

        // Heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
        if (headingMatch) {
            nodes.push({
                type: 'heading',
                attrs: { level: headingMatch[1].length },
                content: [{ type: 'text', text: headingMatch[2] }]
            })
            continue
        }

        // Bullet list item
        const bulletMatch = line.match(/^[-*+]\s+(.+)$/)
        if (bulletMatch) {
            nodes.push({
                type: 'bulletList',
                content: [{
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: [{ type: 'text', text: bulletMatch[1] }]
                    }]
                }]
            })
            continue
        }

        // Numbered list item
        const numberedMatch = line.match(/^\d+\.\s+(.+)$/)
        if (numberedMatch) {
            nodes.push({
                type: 'orderedList',
                content: [{
                    type: 'listItem',
                    content: [{
                        type: 'paragraph',
                        content: [{ type: 'text', text: numberedMatch[1] }]
                    }]
                }]
            })
            continue
        }

        // Blockquote
        const quoteMatch = line.match(/^>\s*(.*)$/)
        if (quoteMatch) {
            nodes.push({
                type: 'blockquote',
                content: [{
                    type: 'paragraph',
                    content: quoteMatch[1] ? [{ type: 'text', text: quoteMatch[1] }] : []
                }]
            })
            continue
        }

        // Horizontal rule
        if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
            nodes.push({ type: 'horizontalRule' })
            continue
        }

        // Empty line
        if (line.trim() === '') {
            continue
        }

        // Regular paragraph with inline formatting
        const inlineContent = parseInlineMarkdown(line)
        nodes.push({
            type: 'paragraph',
            content: inlineContent
        })
    }

    // Handle unclosed code block
    if (inCodeBlock && codeContent.length > 0) {
        nodes.push({
            type: 'codeBlock',
            attrs: { language: codeLanguage || 'text' },
            content: [{ type: 'text', text: codeContent.join('\n') }]
        })
    }

    return nodes.length > 0 ? nodes : [{ type: 'paragraph', content: [{ type: 'text', text: markdown }] }]
}

/**
 * Parse inline Markdown formatting
 */
export const parseInlineMarkdown = (text: string): any[] => {
    const result: any[] = []
    let remaining = text

    while (remaining.length > 0) {
        // Bold **text**
        const boldMatch = remaining.match(/^(.*)\*\*(.+?)\*\*(.*)$/)
        if (boldMatch) {
            if (boldMatch[1]) result.push(...parseInlineMarkdown(boldMatch[1]))
            result.push({ type: 'text', text: boldMatch[2], marks: [{ type: 'bold' }] })
            remaining = boldMatch[3]
            continue
        }

        // Italic *text* or _text_
        const italicMatch = remaining.match(/^(.*)[*_]([^*_]+)[*_](.*)$/)
        if (italicMatch) {
            if (italicMatch[1]) result.push(...parseInlineMarkdown(italicMatch[1]))
            result.push({ type: 'text', text: italicMatch[2], marks: [{ type: 'italic' }] })
            remaining = italicMatch[3]
            continue
        }

        // Inline code `text`
        const codeMatch = remaining.match(/^(.*)`([^`]+)`(.*)$/)
        if (codeMatch) {
            if (codeMatch[1]) result.push(...parseInlineMarkdown(codeMatch[1]))
            result.push({ type: 'text', text: codeMatch[2], marks: [{ type: 'code' }] })
            remaining = codeMatch[3]
            continue
        }

        // Link [text](url)
        const linkMatch = remaining.match(/^(.*)\[([^\]]+)\]\(([^)]+)\)(.*)$/)
        if (linkMatch) {
            if (linkMatch[1]) result.push(...parseInlineMarkdown(linkMatch[1]))
            result.push({
                type: 'text',
                text: linkMatch[2],
                marks: [{ type: 'link', attrs: { href: linkMatch[3] } }]
            })
            remaining = linkMatch[4]
            continue
        }

        // Plain text
        result.push({ type: 'text', text: remaining })
        break
    }

    return result
}

/**
 * Convert content items to ProseMirror nodes
 */
export const contentItemsToNodes = (items: Array<{
    content: string
    type?: 'paragraph' | 'heading' | 'bulletItem' | 'numberedItem' | 'quote'
    headingLevel?: number
}>): any[] => {
    const nodes: any[] = []

    for (const item of items) {
        const { content, type = 'paragraph', headingLevel = 2 } = item

        switch (type) {
            case 'heading':
                nodes.push({
                    type: 'heading',
                    attrs: { level: Math.min(6, Math.max(1, headingLevel)) },
                    content: [{ type: 'text', text: content }]
                })
                break
            case 'bulletItem':
                nodes.push({
                    type: 'bulletList',
                    content: [{
                        type: 'listItem',
                        content: [{
                            type: 'paragraph',
                            content: [{ type: 'text', text: content }]
                        }]
                    }]
                })
                break
            case 'numberedItem':
                nodes.push({
                    type: 'orderedList',
                    content: [{
                        type: 'listItem',
                        content: [{
                            type: 'paragraph',
                            content: [{ type: 'text', text: content }]
                        }]
                    }]
                })
                break
            case 'quote':
                nodes.push({
                    type: 'blockquote',
                    content: [{
                        type: 'paragraph',
                        content: [{ type: 'text', text: content }]
                    }]
                })
                break
            case 'paragraph':
            default:
                nodes.push({
                    type: 'paragraph',
                    content: [{ type: 'text', text: content }]
                })
        }
    }

    return nodes
}
