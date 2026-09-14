package com.knowledge.agent.core.skill;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.config.AgentCoreProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Regression tests for the remote-skill liveness contract. The SDK reports
 * <em>skill ids</em> in its heartbeat while the registry keys tools by
 * tool name; matching the wrong one silently pruned every remote skill after
 * the stale window.
 */
class RemoteSkillRegistryTest {

    private StringRedisTemplate redis;
    private ValueOperations<String, String> valueOps;
    private SetOperations<String, String> setOps;
    private RemoteSkillRegistry registry;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        valueOps = mock(ValueOperations.class);
        setOps = mock(SetOperations.class);
        when(redis.opsForValue()).thenReturn(valueOps);
        when(redis.opsForSet()).thenReturn(setOps);

        AgentCoreProperties properties = new AgentCoreProperties();
        properties.getRemoteSkill().setStaleMs(90_000);
        registry = new RemoteSkillRegistry(
                redis, new ObjectMapper(), mock(RemoteSkillInvoker.class), properties);
    }

    private RemoteSkillRecord record(String skillId, String toolName) {
        return RemoteSkillRecord.builder()
                .serviceId("knowledge-wiki")
                .skillId(skillId)
                .toolName(toolName)
                .name(toolName)
                .description(toolName)
                .parameterSchema("{\"type\":\"object\"}")
                .callbackUrl("http://knowledge-wiki:7778/api/v1/agent-sdk/invoke")
                .build();
    }

    private void expire(RemoteSkillTool... tools) {
        long stale = System.currentTimeMillis() - 200_000;
        for (RemoteSkillTool tool : tools) {
            tool.getRecord().setLastHeartbeat(stale);
        }
    }

    @Test
    void heartbeatUsingSkillIdRefreshesEveryToolOfThatSkill() {
        registry.register("knowledge-wiki", Arrays.asList(
                record("wiki-page", "summarize_page"),
                record("wiki-page", "search_content"),
                record("wiki-page", "write_page")));
        expire(registry.find("summarize_page"),
                registry.find("search_content"),
                registry.find("write_page"));
        assertTrue(registry.liveTools().isEmpty(), "tools should be stale before the heartbeat");

        // This is exactly what AgentSkillRegistrar sends.
        registry.heartbeat("knowledge-wiki", Collections.singletonList("wiki-page"));

        assertEquals(3, registry.liveTools().size(),
                "one skill id must refresh all of its tools");
    }

    @Test
    void heartbeatUsingToolNameStillWorks() {
        registry.register("knowledge-wiki", Collections.singletonList(
                record("wiki-page", "summarize_page")));
        expire(registry.find("summarize_page"));
        assertTrue(registry.liveTools().isEmpty());

        registry.heartbeat("knowledge-wiki", Collections.singletonList("summarize_page"));
        assertEquals(1, registry.liveTools().size());
    }

    @Test
    void emptyHeartbeatRefreshesWholeService() {
        registry.register("knowledge-wiki", Arrays.asList(
                record("wiki-page", "summarize_page"),
                record("wiki-page", "write_page")));
        expire(registry.find("summarize_page"), registry.find("write_page"));

        registry.heartbeat("knowledge-wiki", Collections.emptyList());
        assertEquals(2, registry.liveTools().size());
    }

    @Test
    void heartbeatForAnotherServiceDoesNotRefresh() {
        registry.register("knowledge-wiki", Collections.singletonList(
                record("wiki-page", "summarize_page")));
        expire(registry.find("summarize_page"));

        registry.heartbeat("knowledge-file-center", Collections.singletonList("wiki-page"));
        assertTrue(registry.liveTools().isEmpty());
    }

    @Test
    void restoreTreatsRedisRecordsAsFresh() throws Exception {
        String key = "agentcore:skill:knowledge-wiki:summarize_page";
        RemoteSkillRecord stored = record("wiki-page", "summarize_page");
        stored.setLastHeartbeat(System.currentTimeMillis() - 10_000_000L);
        when(redis.keys(anyString())).thenReturn(new LinkedHashSet<>(Collections.singletonList(key)));
        when(valueOps.get(key)).thenReturn(new ObjectMapper().writeValueAsString(stored));

        registry.run(null);

        assertEquals(1, registry.liveTools().size(),
                "a restart must not instantly prune restored registrations");
    }

    @Test
    void unregisterRemovesServiceTools() {
        registry.register("knowledge-wiki", Collections.singletonList(
                record("wiki-page", "summarize_page")));
        assertEquals(1, registry.size());

        registry.unregister("knowledge-wiki");

        assertEquals(0, registry.size());
        assertTrue(registry.liveTools().isEmpty());
    }

    @Test
    void statusSnapshotMarksStaleToolsNotLive() {
        registry.register("knowledge-wiki", Collections.singletonList(
                record("wiki-page", "summarize_page")));
        expire(registry.find("summarize_page"));

        List<Map<String, Object>> snapshot = registry.statusSnapshot();

        assertEquals(1, snapshot.size());
        assertEquals(Boolean.FALSE, snapshot.get(0).get("live"));
        assertEquals("wiki-page", snapshot.get(0).get("skillId"));
    }
}
