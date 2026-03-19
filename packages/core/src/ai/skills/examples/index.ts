/**
 * Example Skills for Marketplace
 *
 * These are example skill definitions that can be shared and installed.
 * Users can host these JSON files on GitHub Gist, personal servers, etc.
 */

import type { SerializableSkill } from '../skill-registry'

/**
 * Translation Assistant Skill (Example)
 */
export const exampleTranslationSkill: SerializableSkill = {
    id: 'translation-assistant',
    name: 'translation-assistant',
    displayName: '翻译助手',
    description: '多语言翻译技能 - 支持中英日韩等多种语言的翻译和润色',
    version: '1.0.0',
    author: 'Knowledge Repo',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'replaceContent',
        'askUserChoice'
    ],
    optionalTools: [
        'webSearch',
        'insertNear',
        'batchInsert'
    ],
    systemPromptFragment: `## Translation Assistant Skill Active

You are now in translation mode. Follow these guidelines:

### Translation Workflow
1. **Identify Source Language**: Detect the source language automatically
2. **Ask Target Language**: Use askUserChoice to confirm target language if not specified
3. **Preserve Formatting**: Maintain original markdown formatting, headings, lists, etc.
4. **Context Awareness**: Consider the document context for accurate translation

### Translation Quality
- Use natural, fluent expressions in the target language
- Preserve technical terms when appropriate (with translations in parentheses)
- Maintain the original tone and style
- Handle idioms and cultural references appropriately

### Supported Languages
- Chinese (Simplified/Traditional)
- English
- Japanese
- Korean
- French
- German
- Spanish
- And more...

### Example Commands
- "翻译成英文" - Translate to English
- "Translate to Chinese" - Translate to Chinese
- "日本語に翻訳" - Translate to Japanese`,
    tags: ['translation', 'language', 'i18n', 'localization']
}

/**
 * Code Documentation Skill
 */
export const codeDocumentationSkill: SerializableSkill = {
    id: 'code-documentation',
    name: 'code-documentation',
    displayName: '代码文档生成',
    description: '自动生成代码文档 - 分析代码块并生成 JSDoc、注释和 README',
    version: '1.0.0',
    author: 'Knowledge Repo',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'insertNear',
        'replaceContent'
    ],
    optionalTools: [
        'askUserChoice',
        'insertSegmentedMarkdown'
    ],
    systemPromptFragment: `## Code Documentation Skill Active

You are now in code documentation mode. Follow these guidelines:

### Documentation Workflow
1. **Identify Code Blocks**: Find code blocks in the document
2. **Analyze Code**: Understand the code structure and purpose
3. **Generate Documentation**: Create appropriate documentation

### Documentation Types
- **JSDoc/TSDoc**: For JavaScript/TypeScript functions and classes
- **Docstrings**: For Python functions and classes
- **Inline Comments**: For complex logic sections
- **README**: For project overviews

### Documentation Quality
- Clear and concise descriptions
- Document all parameters and return values
- Include usage examples when helpful
- Note any side effects or exceptions

### Output Format
\`\`\`javascript
/**
 * Brief description of the function
 *
 * @param {type} paramName - Parameter description
 * @returns {type} Return value description
 * @example
 * // Usage example
 * functionName(arg1, arg2)
 */
\`\`\``,
    tags: ['code', 'documentation', 'jsdoc', 'comments']
}

/**
 * Meeting Notes Skill
 */
export const meetingNotesSkill: SerializableSkill = {
    id: 'meeting-notes',
    name: 'meeting-notes',
    displayName: '会议纪要整理',
    description: '会议纪要整理技能 - 从会议记录中提取关键信息、行动项和决策',
    version: '1.0.0',
    author: 'Knowledge Repo',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'insertSegmentedMarkdown',
        'replaceContent'
    ],
    optionalTools: [
        'askUserChoice',
        'insertAtEnd'
    ],
    systemPromptFragment: `## Meeting Notes Skill Active

You are now in meeting notes mode. Follow these guidelines:

### Meeting Notes Structure
1. **Meeting Info**: Date, participants, duration
2. **Agenda**: Topics discussed
3. **Key Decisions**: Important decisions made
4. **Action Items**: Tasks assigned with owners and deadlines
5. **Follow-ups**: Items for future meetings

### Extraction Guidelines
- Identify speakers and their key points
- Extract concrete action items with assignees
- Highlight decisions and their rationale
- Note any unresolved questions

### Output Format
\`\`\`markdown
## 会议纪要

### 基本信息
- 日期：
- 参与者：
- 时长：

### 议题
1. 议题1
2. 议题2

### 关键决策
- 决策1
- 决策2

### 行动项
| 任务 | 负责人 | 截止日期 |
|------|--------|----------|
| 任务1 | 张三 | 2024-01-15 |

### 后续事项
- ...
\`\`\``,
    tags: ['meeting', 'notes', 'summary', 'action-items']
}

/**
 * Writing Enhancement Skill
 */
export const writingEnhancementSkill: SerializableSkill = {
    id: 'writing-enhancement',
    name: 'writing-enhancement',
    displayName: '写作增强',
    description: '写作增强技能 - 改进文章结构、语法、风格和可读性',
    version: '1.0.0',
    author: 'Knowledge Repo',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'replaceContent',
        'askUserChoice'
    ],
    optionalTools: [
        'insertNear',
        'deleteBySearch'
    ],
    systemPromptFragment: `## Writing Enhancement Skill Active

You are now in writing enhancement mode. Follow these guidelines:

### Enhancement Areas
1. **Grammar & Spelling**: Fix errors while preserving style
2. **Clarity**: Simplify complex sentences
3. **Conciseness**: Remove redundancy
4. **Flow**: Improve transitions between ideas
5. **Tone**: Adjust formality as needed

### Enhancement Workflow
1. Read the document structure first
2. Identify areas for improvement
3. Ask user about the desired tone/style
4. Make improvements incrementally
5. Preserve the author's voice

### Style Guidelines
- Active voice over passive when appropriate
- Concrete words over abstract
- Short sentences for complex ideas
- Varied sentence length for rhythm

### Before Making Changes
- Always show the original text
- Explain the reason for changes
- Offer alternatives when possible`,
    tags: ['writing', 'grammar', 'style', 'editing']
}

/**
 * All example skills
 */
export const exampleSkills: SerializableSkill[] = [
    exampleTranslationSkill,
    codeDocumentationSkill,
    meetingNotesSkill,
    writingEnhancementSkill
]

/**
 * Get example skill by ID
 */
export function getExampleSkill(id: string): SerializableSkill | undefined {
    return exampleSkills.find(s => s.id === id)
}
