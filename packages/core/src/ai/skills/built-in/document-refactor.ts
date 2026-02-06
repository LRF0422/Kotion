/**
 * Document Refactor Skill
 *
 * A high-level skill for restructuring and reorganizing documents.
 * Combines document reading, analysis, and writing tools with
 * specialized prompts for refactoring tasks.
 */

import type { Skill } from '../../types'

export const documentRefactorSkill: Skill = {
    name: 'document-refactor',
    description: '文档重构技能 - 用于重新组织文档结构、改进内容层次、优化可读性',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'insertNear',
        'replaceContent',
        'deleteBySearch',
        'askUserChoice'
    ],
    optionalTools: [
        'batchInsert',
        'insertAfterBlock',
        'deleteBlock',
        'insertSegmentedMarkdown'
    ],
    systemPromptFragment: `## Document Refactor Skill Active

You are now in document refactoring mode. Follow these guidelines:

### Refactoring Workflow
1. **Analyze First**: Always start by understanding the current document structure using getDocumentStructure
2. **Plan Changes**: Before making changes, create a mental plan of the restructuring
3. **Confirm Major Changes**: Use askUserChoice for significant structural changes
4. **Preserve Content**: Never delete content without explicit confirmation
5. **Work Incrementally**: Make changes in small, verifiable steps

### Refactoring Operations
- **Merge Sections**: Combine related sections while preserving all content
- **Split Sections**: Break large sections into smaller, focused parts
- **Reorder Content**: Move sections to improve logical flow
- **Add Hierarchy**: Introduce or adjust heading levels for better structure
- **Clean Up**: Remove redundancy and improve consistency

### Best Practices
- Maintain consistent heading levels (don't skip levels)
- Keep related content together
- Use parallel structure for similar sections
- Preserve all links and references
- Update any internal references after moving content

### Example Refactoring Tasks
- "重构这篇文章的结构" - Restructure article organization
- "合并相似的章节" - Merge similar sections
- "改进文档的可读性" - Improve document readability
- "调整标题层级" - Adjust heading hierarchy`,
    tags: ['refactor', 'structure', 'organize', 'document'],
    source: 'builtin'
}
