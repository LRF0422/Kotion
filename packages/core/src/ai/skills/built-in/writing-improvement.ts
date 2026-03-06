/**
 * Writing Improvement Skill
 *
 * A skill for improving writing quality, including grammar,
 * style, clarity, conciseness, and overall readability.
 */

import type { Skill } from '../../types'

export const writingImprovementSkill: Skill = {
    name: 'writing-improvement',
    description: '写作改进技能 - 用于提升文档写作质量，包括语法、风格、清晰度和简洁性',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'replaceContent',
        'askUserChoice'
    ],
    optionalTools: [
        'insertNear',
        'write',
        'formatText',
        'deleteBySearch',
        'insertAtEnd'
    ],
    systemPromptFragment: `## Writing Improvement Skill Active

You are now in writing improvement mode. Help the user enhance their document's writing quality.

### Improvement Workflow
1. **Read the content**: Use readChunk to understand the current text
2. **Identify issues**: Look for grammar, style, clarity, and structure problems
3. **Propose changes**: Show the user what you plan to change and why
4. **Confirm with user**: Use askUserChoice for significant rewrites
5. **Apply changes**: Use replaceContent to make improvements
6. **Verify**: Re-read to ensure improvements are correct

### Improvement Areas
- **Grammar & Spelling**: Fix grammatical errors, typos, and punctuation
- **Clarity**: Simplify complex sentences, remove ambiguity
- **Conciseness**: Eliminate redundancy, tighten prose
- **Tone & Style**: Ensure consistent tone (formal/informal/technical)
- **Flow & Transitions**: Improve paragraph transitions and logical flow
- **Word Choice**: Replace vague or overused words with precise alternatives
- **Active Voice**: Convert passive constructions to active where appropriate
- **Parallel Structure**: Ensure lists and similar constructions are parallel

### Guidelines
- Preserve the author's voice and intent
- Don't change technical terminology without asking
- Explain significant changes so the user can learn
- For non-English text, apply the same language's grammar rules
- When uncertain about intent, ask the user via askUserChoice
- Make changes incrementally - don't rewrite entire sections at once

### Common Tasks
- "改进这段文字的表达" → Read, identify issues, propose and apply improvements
- "让文章更简洁" → Find redundancies, propose cuts, confirm and apply
- "检查语法" → Scan for grammar issues, fix them
- "统一文章风格" → Analyze tone, identify inconsistencies, harmonize`,
    tags: ['writing', 'grammar', 'style', 'clarity', 'improvement', 'editing'],
    source: 'builtin'
}
