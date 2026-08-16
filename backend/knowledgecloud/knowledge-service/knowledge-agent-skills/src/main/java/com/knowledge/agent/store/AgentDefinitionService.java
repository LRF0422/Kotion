package com.knowledge.agent.store;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.entity.AgentDefinitionEntity;
import com.knowledge.agent.store.mapper.AgentDefinitionMapper;
import com.knowledge.agent.v2.tool.CustomAgentResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CRUD + assembly service for custom agent definitions.
 *
 * <p>
 * All queries are tenant-scoped (explicit {@code tenant_id} condition —
 * the mapper bypasses the tenant-line interceptor). Also implements
 * {@link CustomAgentResolver} so {@code delegate_task(agent_name)} can
 * assemble sub-agents from definitions.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentDefinitionService implements CustomAgentResolver {

    private static final int MAX_DEFINITION_ITERATIONS = 100;
    /** Sentinel making a corrupted tool-id JSON fail closed instead of "all tools". */
    private static final Set<String> INVALID_TOOL_SET =
            Collections.singleton("__invalid_tool_ids__");

    private final AgentDefinitionMapper mapper;
    private final ObjectMapper objectMapper;

    // ---- CRUD (tenant-scoped) ----

    public List<AgentDefinitionEntity> list(Long tenantId) {
        return mapper.selectList(new LambdaQueryWrapper<AgentDefinitionEntity>()
                .eq(AgentDefinitionEntity::getTenantId, tenantId)
                .orderByDesc(AgentDefinitionEntity::getUpdateTime));
    }

    public AgentDefinitionEntity get(Long id, Long tenantId) {
        return mapper.selectOne(new LambdaQueryWrapper<AgentDefinitionEntity>()
                .eq(AgentDefinitionEntity::getId, id)
                .eq(AgentDefinitionEntity::getTenantId, tenantId));
    }

    public AgentDefinitionEntity create(AgentDefinitionEntity entity, Long tenantId, Long userId) {
        validate(entity);
        if (nameExists(entity.getName(), tenantId, null)) {
            throw new IllegalArgumentException("Agent name already exists: " + entity.getName());
        }
        entity.setId(null);
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        if (entity.getEnabled() == null) {
            entity.setEnabled(true);
        }
        mapper.insert(entity);
        return entity;
    }

    public AgentDefinitionEntity update(Long id, AgentDefinitionEntity changes, Long tenantId) {
        AgentDefinitionEntity existing = get(id, tenantId);
        if (existing == null) {
            throw new IllegalArgumentException("Agent definition not found: " + id);
        }
        validate(changes);
        if (nameExists(changes.getName(), tenantId, id)) {
            throw new IllegalArgumentException("Agent name already exists: " + changes.getName());
        }
        existing.setName(changes.getName());
        existing.setDescription(changes.getDescription());
        existing.setSystemPrompt(changes.getSystemPrompt());
        existing.setModelName(changes.getModelName());
        existing.setToolIds(changes.getToolIds());
        existing.setMaxIterations(changes.getMaxIterations());
        if (changes.getEnabled() != null) {
            existing.setEnabled(changes.getEnabled());
        }
        mapper.updateById(existing);
        return existing;
    }

    public void delete(Long id, Long tenantId) {
        AgentDefinitionEntity existing = get(id, tenantId);
        if (existing == null) {
            throw new IllegalArgumentException("Agent definition not found: " + id);
        }
        mapper.deleteById(id);
    }

    // ---- CustomAgentResolver (delegation target lookup) ----

    @Override
    public Optional<CustomAgentSpec> resolve(String agentName, Long tenantId) {
        AgentDefinitionEntity entity = mapper.selectOne(new LambdaQueryWrapper<AgentDefinitionEntity>()
                .eq(AgentDefinitionEntity::getTenantId, tenantId)
                .eq(AgentDefinitionEntity::getName, agentName)
                .eq(AgentDefinitionEntity::getEnabled, true));
        return Optional.ofNullable(entity).map(this::toSpec);
    }

    @Override
    public List<CustomAgentSpec> listAvailable(Long tenantId) {
        return mapper.selectList(new LambdaQueryWrapper<AgentDefinitionEntity>()
                .eq(AgentDefinitionEntity::getTenantId, tenantId)
                .eq(AgentDefinitionEntity::getEnabled, true))
                .stream().map(this::toSpec).collect(Collectors.toList());
    }

    /**
     * Convert an entity to the engine-facing spec, parsing the tool id JSON.
     */
    public CustomAgentSpec toSpec(AgentDefinitionEntity entity) {
        Set<String> toolIds;
        try {
            toolIds = parseToolIdsStrict(entity.getToolIds());
        } catch (IllegalArgumentException e) {
            // Corrupted legacy rows must never become "all backend tools".
            log.error("AgentDefinition: corrupted tool_ids for agent {}: {}",
                    entity.getName(), e.getMessage());
            toolIds = INVALID_TOOL_SET;
        }
        return new CustomAgentSpec(
                entity.getName(),
                entity.getDescription(),
                entity.getSystemPrompt(),
                entity.getModelName(),
                toolIds,
                entity.getMaxIterations());
    }

    /**
     * Parse the {@code tool_ids} JSON array column. Null/empty/invalid →
     * empty set (= all backend tools).
     */
    public Set<String> parseToolIds(String toolIdsJson) {
        try {
            return parseToolIdsStrict(toolIdsJson);
        } catch (IllegalArgumentException e) {
            log.warn("AgentDefinition: invalid tool_ids JSON '{}': {}", toolIdsJson, e.getMessage());
            return Collections.emptySet();
        }
    }

    /** Strict parser used for create/update validation and engine assembly. */
    public Set<String> parseToolIdsStrict(String toolIdsJson) {
        if (toolIdsJson == null || toolIdsJson.trim().isEmpty()) {
            return Collections.emptySet();
        }
        try {
            List<String> ids = objectMapper.readValue(toolIdsJson, new TypeReference<List<String>>() {
            });
            return new LinkedHashSet<>(ids);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid tool_ids JSON: " + e.getMessage());
        }
    }

    // ---- Internals ----

    private void validate(AgentDefinitionEntity entity) {
        if (entity.getName() == null || entity.getName().trim().isEmpty()) {
            throw new IllegalArgumentException("Agent name is required");
        }
        if (entity.getSystemPrompt() == null || entity.getSystemPrompt().trim().isEmpty()) {
            throw new IllegalArgumentException("System prompt is required");
        }
        if (entity.getName().length() > 64) {
            throw new IllegalArgumentException("Agent name too long (max 64 chars)");
        }
        if (entity.getMaxIterations() != null && entity.getMaxIterations() < 1) {
            throw new IllegalArgumentException("maxIterations must be >= 1");
        }
        if (entity.getMaxIterations() != null
                && entity.getMaxIterations() > MAX_DEFINITION_ITERATIONS) {
            throw new IllegalArgumentException(
                    "maxIterations must be <= " + MAX_DEFINITION_ITERATIONS);
        }
        if (entity.getToolIds() != null && !entity.getToolIds().trim().isEmpty()) {
            parseToolIdsStrict(entity.getToolIds());
        }
    }

    private boolean nameExists(String name, Long tenantId, Long excludeId) {
        LambdaQueryWrapper<AgentDefinitionEntity> query = new LambdaQueryWrapper<AgentDefinitionEntity>()
                .eq(AgentDefinitionEntity::getTenantId, tenantId)
                .eq(AgentDefinitionEntity::getName, name);
        if (excludeId != null) {
            query.ne(AgentDefinitionEntity::getId, excludeId);
        }
        return mapper.selectCount(query) > 0;
    }
}
