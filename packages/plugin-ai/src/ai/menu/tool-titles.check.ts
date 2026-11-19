import { strict as assert } from 'node:assert'
import { humanizeToolName, toolCallTitle, toolLabel, type ToolTitleTranslate } from './tool-titles'

/**
 * The activity timeline titles a call by what it actually did. These rules are
 * the difference between "读取内容" and "从第 1200 字符起读取", so they are
 * pinned here — including the fallbacks, because a call whose args are still
 * streaming must not render an empty "「」" template.
 */

const TEMPLATES: Record<string, string> = {
    'ai.chat.toolNames.deleteBlocks': '删除块',
    'ai.chat.toolNames.editPage': '切换编辑页面',
    'ai.chat.toolNames.updateTitle': '更新标题',
    'ai.chat.toolNames.readChunk': '读取内容',
    'ai.chat.toolNames.applyEdits': '批量编辑',
    'ai.chat.toolNames.web_search': '网络搜索',
    'ai.chat.toolTitles.updateTitle': '修改标题「{{name}}」',
    'ai.chat.toolTitles.editPage': '切换到页面「{{name}}」',
    'ai.chat.toolTitles.searchInDocument': '在文档中搜索「{{name}}」',
    'ai.chat.toolTitles.webSearch': '网络搜索「{{name}}」',
    'ai.chat.toolTitles.webFetch': '抓取网页 {{name}}',
    'ai.chat.toolTitles.readFrom': '从第 {{from}} 字符起读取',
    'ai.chat.toolTitles.applyEdits': '批量编辑 {{count}} 处',
    'ai.chat.toolTitles.deleteBlocks': '删除 {{count}} 个块',
    'ai.chat.toolTitles.askUserChoice': '询问「{{name}}」',
    'ai.chat.toolTitles.loadSkill': '加载技能 {{name}}',
}

/** i18next-compatible enough for these tests: templates + `{{var}}` only. */
const t: ToolTitleTranslate = (key, options = {}) => {
    const template = TEMPLATES[key]
    if (!template) return key
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        options[name] === undefined ? '' : String(options[name]))
}

const title = (toolName: string, args?: unknown, result?: unknown) =>
    toolCallTitle(t, { toolName, args, result })

// 1. The call's own subject beats the generic tool name.
assert.equal(title('updateTitle', { newTitle: '第三季度周报' }), '修改标题「第三季度周报」')
assert.equal(title('searchInDocument', { query: '季度目标' }), '在文档中搜索「季度目标」')
assert.equal(title('web_search', { query: 'Notion API' }), '网络搜索「Notion API」')
assert.equal(title('askUserChoice', { question: '是否继续？' }), '询问「是否继续？」')
assert.equal(title('load_skill', { skill: 'doc-review' }), '加载技能 doc-review')

// 2. `editPage` only RETARGETS editing — its title must name the page, and the
//    title comes from the result because the args only carry an id.
assert.equal(title('editPage', { pageId: '42' }, { success: true, title: '入职手册' }), '切换到页面「入职手册」')
// No result yet (still running) → plain label, never a dangling template.
assert.equal(title('editPage', { pageId: '42' }), '切换编辑页面')

// 3. A wrong argument name must fall back instead of rendering an empty subject.
assert.equal(title('updateTitle', { title: '旧的参数名' }), '更新标题')

// 4. Numbers: batch edits, multi-block deletes, chunk offset.
assert.equal(title('applyEdits', { operations: [{ action: 'append' }, { action: 'deleteBlock' }] }), '批量编辑 2 处')
assert.equal(title('deleteBlocks', { blockIds: ['a', 'b', 'c'] }), '删除 3 个块')
assert.equal(title('deleteBlocks', { blockIds: ['a'] }), '删除块')
assert.equal(title('readChunk', { from: 1200 }), '从第 1200 字符起读取')
// Reading from the very start is the normal case: keep the plain label.
assert.equal(title('readChunk', { from: 0 }), '读取内容')

// 5. URLs are reduced to their host — the full URL would eat the line.
assert.equal(title('web_fetch', { url: 'https://www.example.com/docs/guide?q=1' }), '抓取网页 www.example.com')

// 6. Subjects are clipped to one line (24 chars + ellipsis).
const long = '这是一个特别长的页面标题用来检查标题截断行为是否正确处理的用例'
const clipped = title('updateTitle', { newTitle: long })
assert.ok(clipped.startsWith('修改标题「'), clipped)
assert.ok(clipped.endsWith('…」'), clipped)
assert.ok(clipped.length < long.length + 6, clipped)

// 7. Unknown (plugin) tools: readable Title Case from the id, never raw snake_case.
assert.equal(title('buildPluginProject'), 'Build Plugin Project')
assert.equal(humanizeToolName('wait_for_children'), 'Wait for children')

// 8. `toolLabel` prefers the translation and falls back without throwing.
assert.equal(toolLabel(t, 'web_search'), '网络搜索')
assert.equal(toolLabel(t, 'pluginOnlyTool'), 'Plugin Only Tool')
assert.equal(toolLabel(t, 'webSearch'), 'Web Search')

// 9. Malformed / still-streaming args never throw.
assert.equal(title('updateTitle', undefined), '更新标题')
assert.equal(title('updateTitle', 'not-an-object'), '更新标题')
assert.equal(title('deleteBlocks', { blockIds: [] }), '删除块')
assert.equal(title('applyEdits', { operations: 'nope' }), '批量编辑')

console.log('tool-titles: ok')