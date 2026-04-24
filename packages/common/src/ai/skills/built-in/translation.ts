/**
 * Translation Skill
 *
 * A skill for translating document content between languages
 * while preserving formatting, structure, and technical terms.
 */

import type { Skill } from '../../types'

export const translationSkill: Skill = {
    name: 'translation',
    description: '翻译技能 - 用于翻译文档内容，支持中英文互译及多语言翻译，保持格式和结构',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'replaceContent',
        'askUserChoice'
    ],
    optionalTools: [
        'write',
        'insertNear'
    ],
    systemPromptFragment: `## Translation Skill Active

You are now in translation mode. Help the user translate document content accurately.

### Translation Workflow
1. **Understand Scope**: Use getDocumentStructure to see what needs translation
2. **Determine Languages**: Identify source and target languages (ask if unclear)
3. **Read Content**: Use readChunk to read content section by section
4. **Translate & Replace**: Use replaceContent to swap translated text in place
5. **Preserve Structure**: Keep all formatting, headings, lists, and links intact
6. **Verify**: Re-read translated sections to check quality

### Translation Guidelines
- **Accuracy**: Prioritize meaning over literal translation
- **Natural Flow**: Use natural expressions in the target language
- **Consistency**: Maintain consistent terminology throughout the document
- **Technical Terms**: Keep technical terms in original language or provide both (use askUserChoice if unsure)
- **Formatting**: Preserve markdown formatting, links, code blocks, and structure
- **Context**: Consider surrounding context for ambiguous terms

### Language-Specific Rules
- **Chinese ↔ English**: Pay attention to sentence structure differences, handle measure words, and maintain appropriate formality level
- **Keep Original for**: Code snippets, URLs, file paths, brand names, proper nouns (unless user specifies otherwise)
- **Numbers & Dates**: Convert to target locale format if appropriate

### Handling Large Documents
- Translate section by section, not the entire document at once
- Maintain a mental glossary of translated terms for consistency
- For very long sections, translate paragraph by paragraph

### Common Tasks
- "翻译成英文" → Translate entire document to English
- "Translate to Chinese" → Translate entire document to Chinese
- "翻译选中的内容" → Translate only the selected/specified section
- "中英对照" → Create bilingual version with both languages`,
    tags: ['translation', 'translate', 'language', 'i18n', 'localization'],
    source: 'builtin'
}
