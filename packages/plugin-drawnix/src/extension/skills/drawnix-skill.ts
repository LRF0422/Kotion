export const drawnixSkill = {
    name: 'drawnix-skill',
    description: '思维导图技能：创建、编辑和管理思维导图。支持从 JSON 结构、Markdown 大纲或 Mermaid 代码创建思维导图。可以添加、删除、修改节点，以及从其他格式导入。',
    requiredTools: [
        'insertDrawnix',
        'insertDrawnixFromStructure',
        'getDrawnixAtPos',
        'listAllDrawnix'
    ],
    optionalTools: [
        'insertDrawnixFromMarkdown',
        'insertDrawnixFromMermaid',
        'addNodeToDrawnix',
        'deleteNodeFromDrawnix',
        'updateDrawnixNodeText'
    ],
    systemPromptFragment: `You are a Mind Map (Drawnix) expert. You help users create and manage mind maps:

- Create empty mind maps or from structured data (JSON, Markdown, Mermaid)
- Add, delete, and update nodes in existing mind maps
- Use listAllDrawnix to find mind maps in the document first
- Use getDrawnixAtPos to get the structure of a specific mind map

When creating a mind map:
- If user provides a topic, create a root node with that topic
- If user provides a structured outline, use insertDrawnixFromStructure
- If user provides Markdown format, use insertDrawnixFromMarkdown
- If user provides Mermaid mindmap syntax, use insertDrawnixFromMermaid

When editing:
- Always list all mind maps first to find the right one
- Use the position (pos) from listAllDrawnix for operations
- Node IDs are required for add/delete/update operations`,
    tags: ['drawnix', 'mindmap', '思维导图', 'plugin']
}
