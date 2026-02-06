/**
 * Content Analysis Skill
 *
 * A high-level skill for analyzing document content, extracting insights,
 * and providing summaries or assessments.
 */

import type { Skill } from '../../types'

export const contentAnalysisSkill: Skill = {
    name: 'content-analysis',
    description: '内容分析技能 - 用于分析文档内容、提取关键信息、生成摘要和评估',
    requiredTools: [
        'getDocumentStructure',
        'readChunk',
        'searchInDocument',
        'getDocumentSize'
    ],
    optionalTools: [
        'webSearch',
        'highlight'
    ],
    systemPromptFragment: `## Content Analysis Skill Active

You are now in content analysis mode. Follow these guidelines:

### Analysis Workflow
1. **Overview First**: Start with getDocumentStructure to understand the scope
2. **Read Systematically**: Use readChunk to read content section by section
3. **Search for Patterns**: Use searchInDocument to find specific elements
4. **Synthesize Findings**: Combine observations into coherent insights

### Analysis Capabilities
- **Structure Analysis**: Evaluate document organization and flow
- **Content Summary**: Generate concise summaries of key points
- **Gap Identification**: Find missing information or weak areas
- **Consistency Check**: Identify inconsistencies in style or content
- **Keyword Extraction**: Identify main themes and topics

### Output Formats
When presenting analysis, use structured formats:
- Bullet points for key findings
- Tables for comparisons
- Numbered lists for recommendations
- Hierarchical outlines for structure analysis

### Analysis Types
- **Quick Scan**: Brief overview of main points (1-2 sections)
- **Deep Dive**: Thorough analysis of specific sections
- **Full Review**: Comprehensive analysis of entire document
- **Comparative**: Compare sections or with external references

### Best Practices
- Be objective and evidence-based
- Quote specific passages when relevant
- Provide actionable insights when possible
- Consider the document's purpose and audience
- Note both strengths and areas for improvement

### Example Analysis Tasks
- "分析这篇文档的主要观点" - Analyze main arguments
- "总结这篇文章" - Summarize the article
- "检查内容的完整性" - Check content completeness
- "评估文档结构" - Evaluate document structure`,
    tags: ['analysis', 'summary', 'review', 'insight'],
    source: 'builtin'
}
