/**
 * Parse Markdown to ProseMirror-compatible JSON nodes
 */
export const parseMarkdownToNodes = (markdown: string): any[] => {
    // Normalize line endings to ensure consistent parsing
    const normalizedMarkdown = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const nodes: any[] = []
    const lines = normalizedMarkdown.split('\n')
    let inCodeBlock = false
    let codeContent: string[] = []
    let codeLanguage = ''
    let inList = false
    let listType: 'bullet' | 'ordered' | null = null
    let currentListItems: any[] = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Code block handling
        if (line.startsWith('```')) {
            // Close any open list before code block
            if (inList && currentListItems.length > 0) {
                nodes.push({
                    type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                    content: currentListItems
                })
                inList = false
                currentListItems = []
                listType = null
            }

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

        // Empty line - close any open list
        if (line.trim() === '') {
            if (inList && currentListItems.length > 0) {
                nodes.push({
                    type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                    content: currentListItems
                })
                inList = false
                currentListItems = []
                listType = null
            }
            continue
        }

        // Heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
        if (headingMatch) {
            // Close any open list before heading
            if (inList && currentListItems.length > 0) {
                nodes.push({
                    type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                    content: currentListItems
                })
                inList = false
                currentListItems = []
                listType = null
            }

            nodes.push({
                type: 'heading',
                attrs: { level: headingMatch[1].length },
                content: parseInlineMarkdown(headingMatch[2])
            })
            continue
        }

        // Bullet list item
        const bulletMatch = line.match(/^\s*([-*+])\s+(.+)$/)
        if (bulletMatch) {
            const indentLevel = line.match(/^\s*/)?.[0]?.length || 0
            const itemContent = bulletMatch[2]

            if (!inList || listType !== 'bullet') {
                // Close any existing list before starting a new one
                if (inList && currentListItems.length > 0) {
                    nodes.push({
                        type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                        content: currentListItems
                    })
                }
                inList = true
                listType = 'bullet'
                currentListItems = []
            }

            currentListItems.push({
                type: 'listItem',
                content: [{
                    type: 'paragraph',
                    content: parseInlineMarkdown(itemContent)
                }]
            })
            continue
        }

        // Numbered list item
        const numberedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/)
        if (numberedMatch) {
            const indentLevel = line.match(/^\s*/)?.[0]?.length || 0
            const itemContent = numberedMatch[2]

            if (!inList || listType !== 'ordered') {
                // Close any existing list before starting a new one
                if (inList && currentListItems.length > 0) {
                    nodes.push({
                        type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                        content: currentListItems
                    })
                }
                inList = true
                listType = 'ordered'
                currentListItems = []
            }

            currentListItems.push({
                type: 'listItem',
                content: [{
                    type: 'paragraph',
                    content: parseInlineMarkdown(itemContent)
                }]
            })
            continue
        }

        // Blockquote
        const quoteMatch = line.match(/^>\s*(.*)$/)
        if (quoteMatch) {
            // Close any open list before blockquote
            if (inList && currentListItems.length > 0) {
                nodes.push({
                    type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                    content: currentListItems
                })
                inList = false
                currentListItems = []
                listType = null
            }

            nodes.push({
                type: 'blockquote',
                content: [{
                    type: 'paragraph',
                    content: parseInlineMarkdown(quoteMatch[1] || '')
                }]
            })
            continue
        }

        // Horizontal rule
        if (/^---+$/.test(line) || /^\*\*\*+$/.test(line)) {
            // Close any open list before horizontal rule
            if (inList && currentListItems.length > 0) {
                nodes.push({
                    type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                    content: currentListItems
                })
                inList = false
                currentListItems = []
                listType = null
            }

            nodes.push({ type: 'horizontalRule' })
            continue
        }

        // Close any open list before paragraph
        if (inList && currentListItems.length > 0) {
            nodes.push({
                type: listType === 'bullet' ? 'bulletList' : 'orderedList',
                content: currentListItems
            })
            inList = false
            currentListItems = []
            listType = null
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

    // Handle unclosed list
    if (inList && currentListItems.length > 0) {
        nodes.push({
            type: listType === 'bullet' ? 'bulletList' : 'orderedList',
            content: currentListItems
        })
    }

    return nodes.length > 0 ? nodes : [{ type: 'paragraph', content: parseInlineMarkdown(markdown) }]
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
