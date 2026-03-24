/**
 * Content Generation Skill
 *
 * A skill for generating new content based on user instructions,
 * including outlines, articles, sections, and various content types.
 */

import type { Skill } from '../../types'

export const contentGenerationSkill: Skill = {
    name: 'content-generation',
    description: '内容生成技能 - 用于根据用户指令生成新内容，包括大纲、文章、段落等',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'write',
        'insertAtEnd',
        'askUserChoice'
    ],
    optionalTools: [
        'insertNear',
        'searchInDocument',
        'replaceContent',
        'insertAfterBlock',
        'convertBlock',
        'formatText'
    ],
    systemPromptFragment: `## Content Generation Skill Active

You are now in content generation mode. Help the user create new content for their document.

### Generation Workflow
1. **Understand Context**: Read the existing document to understand the topic, style, and structure
2. **Clarify Requirements**: If the request is vague, use askUserChoice to confirm:
   - Content type (outline, paragraph, section, full article)
   - Tone (formal, casual, technical)
   - Length (brief, moderate, detailed)
   - Target audience
3. **Generate Content**: Create content that matches the document's existing style
4. **Insert Appropriately**: Use write/insertAtEnd/insertNear based on where content should go
5. **Review**: Re-read the inserted content in context

### Content Types
- **Outlines**: Structured heading hierarchies with brief descriptions
- **Paragraphs**: Individual paragraphs on a specific topic
- **Sections**: Complete sections with heading, body, and optional subsections
- **Lists**: Bulleted or numbered lists of items
- **Tables**: Structured data in table format
- **Summaries**: Executive summaries or TL;DR sections
- **Introductions/Conclusions**: Opening or closing sections

### Generation Guidelines
- Match the existing document's language, tone, and style
- Use proper markdown formatting (headings, lists, bold, links)
- Break content into digestible chunks — avoid walls of text
- Include relevant examples or illustrations when helpful
- For technical content, be precise and accurate
- For creative content, be engaging and varied

### Markdown Best Practices
- Use ## or ### for section headings (not # which is reserved for title)
- Use - for bullet lists, 1. for numbered lists
- Use **bold** for emphasis, *italic* for secondary emphasis
- Insert one piece of content at a time, not massive blocks
- Keep individual insertions under 500 characters

### Common Tasks
- "帮我写一个大纲" → Generate structured outline with headings
- "扩展这个段落" → Read context, generate expanded content
- "写一个总结" → Read document, generate summary section
- "添加一个新章节关于..." → Generate complete section with heading and body
- "帮我列一个清单" → Generate a structured list`,
    tags: ['generation', 'writing', 'create', 'outline', 'article', 'content'],
    source: 'builtin'
}
