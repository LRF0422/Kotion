package com.knowledge.agentcore.memory;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Hierarchical scope keys + relevance ordering. */
class MemoryScopeTest {

    @Test
    void buildsScopesMostSpecificFirst() {
        List<String> scopes = MemoryScope.scopesFor(7L, "space-1", "page-9");
        assertEquals(3, scopes.size());
        assertEquals("u:7:s:space-1:p:page-9", scopes.get(0));
        assertEquals("u:7:s:space-1", scopes.get(1));
        assertEquals("u:7", scopes.get(2));
    }

    @Test
    void skipsMissingLevels() {
        List<String> scopes = MemoryScope.scopesFor(7L, "space-1", null);
        assertEquals(2, scopes.size());
        assertEquals("u:7:s:space-1", scopes.get(0));
        assertEquals("u:7", scopes.get(1));
    }

    @Test
    void mostSpecificPrefersPage() {
        assertEquals("u:7:s:s1:p:p1", MemoryScope.mostSpecific(7L, "s1", "p1"));
        assertEquals("u:7:s:s1", MemoryScope.mostSpecific(7L, "s1", null));
        assertEquals("u:7", MemoryScope.mostSpecific(7L, null, null));
    }
}
