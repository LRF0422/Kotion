/**
 * Knowledge-base skill — the prose half of plugin-main's agent surface.
 *
 * plugin-main contributes the page/space tools the agent steers the workspace
 * with (`createPage`, `searchPages`, `openPageSide` …). Without a skill those
 * tools sat under the manager's generated fragment-less `<plugin>-default` skill:
 * they were callable but undocumented, and impossible to reach through discovery.
 * This is the missing half — when to search, when to create, and how a created
 * page becomes the conversation's edit target.
 */
export const knowledgeBaseSkill = {
    name: 'Knowledge Base Pages',
    description:
        '知识库页面技能：在空间里找页面、找正文、建页面、看页面树、把页面展示给用户。'
        + '新建的页面会默认成为本次对话的离屏编辑目标，之后的文档工具就写它。',
    requiredTools: [
        'listSpaces',
        'getSpacePageTree',
        'searchPages',
        'createPage',
        'openPage',
    ],
    optionalTools: [
        'searchContent',
        'openPageSide',
        'focusArtifact',
    ],
    tags: ['page', 'space', 'knowledge-base', '页面', '空间', '知识库', 'plugin'],
    systemPromptFragment: `# 知识库页面

你能直接操作知识库的页面与空间。**先查再写**：不要凭记忆编 pageId / spaceId，用下面这些工具拿到真实 id。

## 找
- \`listSpaces\`：有哪些空间（知识库），以及当前在哪个。不确定往哪写时先看这个。
- \`getSpacePageTree\`：某个空间的页面层级（父子关系、标题、pageId）。要"放在 XX 下面/旁边"时用它定位参照页面。
- \`searchPages\`：按**标题**搜页面（跨空间），返回 pageId / 标题 / 空间。
- \`searchContent\`：按关键词搜**正文**，返回命中的块文本与归属页面。找"具体信息在哪一页"用这个，找"哪一页叫什么"用 searchPages。

## 建
- \`createPage\`：新建页面。用 \`relativeTo\` + \`position\`（child / sibling）或 \`parentId\` 决定位置，不传就是当前空间的根层级。
- \`createPage\` 默认 \`bindToSession: true\`：**新页面会成为本次对话的离屏编辑目标**，之后的文档工具（读结构、插入块、插图表、多维表格……）都写它，用户界面不会被带走。要落地产出时就用这个顺序：先 createPage，再往这个页面里写。
- 需要在参照页面里加一条指向新页面的链接时，用 \`linkInDocument\`。

## 给用户看
- \`openPageSide\`：在右侧预览分栏打开（不离开对话）—— 展示调研结果、参考资料或刚建的页面的默认选择。
- \`openPage\`：真正跳转过去（会离开当前页面）。**只在用户明确要求跳转时使用**，否则用 openPageSide。
- \`focusArtifact\`：把某个产物设为当前工作目标并展示，用于在多个产物之间切换。

## 边界
- 读写页面**正文内容**用文档工具（需要先确定目标页面：createPage 或 editPage），本技能只管"页面/空间"这一层。
- 删除、移动、改名等破坏性操作先说清打算做什么再调用。`,
}
