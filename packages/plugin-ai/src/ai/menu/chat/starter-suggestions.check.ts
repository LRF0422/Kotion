import { strict as assert } from 'node:assert'
import {
    buildStarterSuggestions,
    hasPersonalizedSuggestions,
    type MemoryLike,
} from './starter-suggestions'

/**
 * The recommendation itself is client-side rule matching, so this check pins
 * the rules: no memories → defaults, one card per memory kind, page-scoped
 * memories win, duplicates/short rows are dropped, and profile traits only
 * count above the confidence floor. A silent regression here would just show
 * the old generic grid, which is invisible in the UI.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0)
const AGENT_DEFAULTS = [
    'ai.chat.promptDraft',
    'ai.chat.promptChart',
    'ai.chat.promptAutomate',
    'ai.chat.promptReorganize',
]
const ASK_DEFAULTS = [
    'ai.chat.promptSummarize',
    'ai.chat.promptFind',
    'ai.chat.promptExplain',
    'ai.chat.promptCompare',
]

let seq = 0
const memory = (content: string, overrides: Partial<MemoryLike> = {}): MemoryLike => ({
    memoryId: 'm' + (++seq),
    scope: 'u:7',
    type: 'note',
    content,
    importance: 50,
    lastAccessTime: NOW,
    ...overrides,
})

// 1. Cold start: no signals → the familiar grid, nothing marked personalized.
{
    const suggestions = buildStarterSuggestions({ mode: 'agent' })
    assert.deepEqual(suggestions.map(s => s.labelKey), AGENT_DEFAULTS)
    assert.equal(suggestions.filter(s => s.source === 'default').length, 4)
    assert.equal(hasPersonalizedSuggestions(suggestions), false)
}

// 2. One card per memory kind, preference first, one default slot kept.
{
    const suggestions = buildStarterSuggestions({
        mode: 'agent',
        now: NOW,
        memories: [
            memory('用户喜欢先给结论再展开', { type: 'preference', importance: 80 }),
            memory('上次在整理产品复盘文档', { type: 'episode', importance: 60 }),
            memory('周会要点需要补上风险一项', { type: 'note', importance: 55 }),
        ],
    })
    assert.deepEqual(suggestions.slice(0, 3).map(s => s.labelKey), [
        'ai.chat.starterPreference',
        'ai.chat.starterEpisode',
        'ai.chat.starterNote',
    ])
    assert.equal(suggestions.length, 4)
    assert.equal(suggestions[0].source, 'memory')
    assert.equal(suggestions[3].source, 'default')
    assert.equal(hasPersonalizedSuggestions(suggestions), true)
}

// 3. Higher-importance memories of the same kind win (one card per kind).
{
    const suggestions = buildStarterSuggestions({
        mode: 'agent',
        now: NOW,
        memories: [
            memory('低重要度的笔记内容', { type: 'note', importance: 20 }),
            memory('高重要度的笔记内容', { type: 'note', importance: 90 }),
        ],
    })
    assert.equal(suggestions[0].labelKey, 'ai.chat.starterNote')
    assert.equal(suggestions[0].params?.topic, '高重要度的笔记内容')
}

// 4. A page-scoped memory beats an equally important user-scoped one.
{
    const suggestions = buildStarterSuggestions({
        mode: 'agent',
        now: NOW,
        pageId: 'page-1',
        memories: [
            memory('这是一条用户级记忆', { type: 'note', lastAccessTime: NOW - 10 * DAY }),
            memory('这是当前页面的记忆', {
                type: 'note',
                scope: 'u:7:s:space-a:p:page-1',
                lastAccessTime: NOW - 10 * DAY,
            }),
        ],
    })
    assert.equal(suggestions[0].labelKey, 'ai.chat.starterNote')
    assert.equal(suggestions[0].params?.topic, '这是当前页面的记忆')
}

// 5. Duplicate content and stub rows never occupy a slot.
{
    const suggestions = buildStarterSuggestions({
        mode: 'agent',
        now: NOW,
        memories: [
            memory('重复的笔记内容', { type: 'note', importance: 70 }),
            memory('重复的笔记内容', { type: 'note', importance: 60 }),
            memory('短', { type: 'episode' }),
            memory('三个字', { type: 'fact' }),
        ],
    })
    assert.equal(suggestions.filter(s => s.source === 'memory').length, 1)
    assert.equal(suggestions[0].params?.topic, '重复的笔记内容')
}

// 6. Long memories are clipped for the prompt and the reason line.
{
    const long = '这是一条非常长的记忆内容'.repeat(30)
    const suggestions = buildStarterSuggestions({
        mode: 'agent',
        now: NOW,
        memories: [memory(long, { type: 'note', importance: 90 })],
    })
    const memoryParam = suggestions[0].params?.memory ?? ''
    const topicParam = suggestions[0].params?.topic ?? ''
    assert.equal(suggestions[0].source, 'memory')
    assert.ok(memoryParam.length <= 200)
    assert.ok(memoryParam.endsWith('…'))
    assert.ok(topicParam.length <= 48)
    assert.ok(topicParam.endsWith('…'))
}

// 7. Profile traits: consent/high-confidence only, and a followed topic beats
//    a format hint even at lower confidence.
{
    const topic = buildStarterSuggestions({
        mode: 'agent',
        traits: [{ dimension: 'content_topic', value: 'AI Agent', confidence: 82 }],
    })
    assert.equal(topic[0].source, 'profile')
    assert.equal(topic[0].labelKey, 'ai.chat.starterTopic')
    assert.equal(topic[0].params?.topic, 'AI Agent')

    const lowConfidence = buildStarterSuggestions({
        mode: 'agent',
        traits: [{ dimension: 'content_topic', value: 'AI Agent', confidence: 40 }],
    })
    assert.equal(hasPersonalizedSuggestions(lowConfidence), false)

    const priority = buildStarterSuggestions({
        mode: 'agent',
        traits: [
            { dimension: 'content_format', value: '表格', confidence: 95 },
            { dimension: 'content_topic', value: '产品设计', confidence: 65 },
        ],
    })
    assert.equal(priority[0].labelKey, 'ai.chat.starterTopic')
    assert.equal(priority[0].params?.topic, '产品设计')

    const format = buildStarterSuggestions({
        mode: 'agent',
        traits: [{ dimension: 'content_format', value: '表格', confidence: 80 }],
    })
    assert.equal(format[0].labelKey, 'ai.chat.starterFormat')
    assert.equal(format[0].params?.format, '表格')

    // When memory fills the personalised slots, no profile card is forced in.
    const memoryFirst = buildStarterSuggestions({
        mode: 'agent',
        now: NOW,
        memories: [
            memory('用户喜欢先给结论', { type: 'preference', importance: 80 }),
            memory('上次在整理产品复盘', { type: 'episode', importance: 70 }),
            memory('周会要点待补充风险', { type: 'note', importance: 60 }),
        ],
        traits: [{ dimension: 'content_topic', value: 'AI Agent', confidence: 90 }],
    })
    assert.equal(memoryFirst.filter(s => s.source === 'profile').length, 0)
    assert.equal(memoryFirst.filter(s => s.source === 'memory').length, 3)
}

// 8. Ask mode keeps its read-only prompts even when memory/profile exist.
{
    const suggestions = buildStarterSuggestions({
        mode: 'ask',
        memories: [memory('用户喜欢表格', { type: 'preference' })],
        traits: [{ dimension: 'content_topic', value: 'AI Agent', confidence: 90 }],
    })
    assert.deepEqual(suggestions.map(s => s.labelKey), ASK_DEFAULTS)
    assert.equal(hasPersonalizedSuggestions(suggestions), false)
}

// 9. Unknown memory kinds degrade to notes; the limit is respected.
{
    const suggestions = buildStarterSuggestions({
        mode: 'agent',
        now: NOW,
        limit: 2,
        memories: [
            memory('未知类型的记忆', { type: 'mystery', importance: 80 }),
            memory('另一条记忆内容', { type: 'episode', importance: 70 }),
            memory('再来一条记忆内容', { type: 'preference', importance: 60 }),
        ],
    })
    assert.equal(suggestions.length, 2)
    assert.equal(suggestions[0].labelKey, 'ai.chat.starterNote')
    assert.equal(suggestions[0].params?.topic, '未知类型的记忆')
    assert.equal(suggestions[1].source, 'default')
}

console.log('starter-suggestions.check: ok')
