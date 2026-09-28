/**
 * Sticky-note skill: the prose half of the plugin's agent contract.
 *
 * Declaring the tool alone left `addStickyNote` under the manager's generated
 * `<plugin>-default` skill, which has no fragment — so the tool was always
 * advertised with no guidance about when to use it, and could not be discovered
 * on demand. Every other document plugin pairs its tools with a skill; this is
 * that pair, matching the comment plugin's reviewer skill.
 */
export const stickyNoteAnnotatorSkill = {
    name: 'Sticky Note Annotator',
    description: '便签标注技能：在文档指定文本上添加便签/便签式注释，用于标记待办、提醒、重点和高亮说明。能精确定位文档中的文本并附加便签。',
    requiredTools: [
        'addStickyNote',
    ],
    optionalTools: [
        'getDocumentStructure',
        'searchInDocument',
        'readChunk',
    ],
    systemPromptFragment: `You annotate documents with sticky notes — short, non-intrusive notes pinned to a passage.

How to use the addStickyNote tool:
- searchText: an EXACT match of text in the document (copy the exact characters)
- note: the sticky note's content, short and self-contained

When to reach for a sticky note instead of a comment:
- a comment is a review remark addressed to the author ("this number looks wrong");
- a sticky note is a marker for the reader ("跟进：等 Q3 数据", "这里需要配图").
Prefer sticky notes for todos, reminders, highlights and follow-ups; use comments for critique.

Guidelines:
- Read the document first so the anchor text is real, then pin notes on the passages that matter.
- One note per passage; keep it to a sentence.
- Several notes in one pass are fine, but do not turn a document into a wall of notes.`,
    tags: ['sticky-note', 'annotation', 'note', '便签', '标注', 'plugin'],
}
