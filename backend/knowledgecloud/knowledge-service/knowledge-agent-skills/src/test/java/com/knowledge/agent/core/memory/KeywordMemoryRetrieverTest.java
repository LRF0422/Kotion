package com.knowledge.agentcore.memory;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Deterministic importance/recency/keyword scoring. */
class KeywordMemoryRetrieverTest {

    private final KeywordMemoryRetriever retriever = new KeywordMemoryRetriever();

    private MemoryEntry entry(String id, int importance, String content, String... tags) {
        MemoryEntry entry = new MemoryEntry();
        entry.setMemoryId(id);
        entry.setImportance(importance);
        entry.setContent(content);
        entry.setTags(Arrays.asList(tags));
        entry.setLastAccessTime(System.currentTimeMillis());
        return entry;
    }

    @Test
    void keywordMatchBeatsEqualImportanceWithoutMatch() {
        MemoryEntry unrelated = entry("a", 60, "关于数据库的内容");
        MemoryEntry matching = entry("b", 60, "用户偏好中文回复");
        List<MemoryEntry> top = retriever.top(Arrays.asList(unrelated, matching), "中文 回复", 5);
        assertEquals("b", top.get(0).getMemoryId());
    }

    @Test
    void tagMatchBoostsRanking() {
        MemoryEntry untagged = entry("a", 60, "数据库优化笔记");
        MemoryEntry tagged = entry("b", 60, "普通笔记", "写作");
        List<MemoryEntry> top = retriever.top(Arrays.asList(untagged, tagged), "写作", 5);
        assertEquals("b", top.get(0).getMemoryId());
    }

    @Test
    void importanceDominatesWithoutQuery() {
        MemoryEntry low = entry("a", 20, "随便记的");
        MemoryEntry high = entry("b", 95, "关键偏好：写作用英文");
        List<MemoryEntry> top = retriever.top(Arrays.asList(low, high), null, 5);
        assertEquals("b", top.get(0).getMemoryId());
    }

    @Test
    void respectsLimitAndStableOrder() {
        List<MemoryEntry> entries = Arrays.asList(
                entry("a", 10, "x1"), entry("b", 30, "x2"), entry("c", 20, "x3"), entry("d", 40, "x4"));
        List<MemoryEntry> top = retriever.top(entries, null, 2);
        assertEquals(2, top.size());
        assertEquals("d", top.get(0).getMemoryId());
        assertEquals("b", top.get(1).getMemoryId());
    }
}
