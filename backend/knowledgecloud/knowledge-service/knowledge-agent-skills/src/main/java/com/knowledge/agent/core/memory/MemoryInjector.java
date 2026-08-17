package com.knowledge.agent.core.memory;

import com.knowledge.agent.core.config.AgentCoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the long-term memory lines injected into the system prompt at run
 * start (page → space → user scopes, top-k, importance+recency scoring).
 */
@Slf4j
@Component
public class MemoryInjector {

    private final MemoryStore memoryStore;
    private final AgentCoreProperties properties;

    public MemoryInjector(MemoryStore memoryStore, AgentCoreProperties properties) {
        this.memoryStore = memoryStore;
        this.properties = properties;
    }

    /**
     * Injection lines for the system prompt, e.g.
     * {@code "[preference] 用户偏好中文回复 (重要性 80)"}.
     */
    public List<String> buildLines(Long userId, String spaceId, String pageId) {
        List<String> lines = new ArrayList<>();
        if (!properties.getMemory().isEnabled() || userId == null) {
            return lines;
        }
        try {
            List<String> scopes = MemoryScope.scopesFor(userId, spaceId, pageId);
            List<MemoryEntry> entries = memoryStore.recall(scopes, null, null, properties.getMemory().getTopK());
            for (MemoryEntry entry : entries) {
                if (entry.getContent() == null || entry.getContent().trim().isEmpty()) {
                    continue;
                }
                lines.add("[" + entry.getType() + "] " + entry.getContent().trim()
                        + " (重要性 " + entry.getImportance() + ")");
            }
        } catch (Exception e) {
            log.warn("memory injection failed for user {}: {}", userId, e.getMessage());
        }
        return lines;
    }
}
