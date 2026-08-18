package com.knowledge.agent.core.run;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.core.entity.AgentRunEntity;
import com.knowledge.agent.core.mapper.AgentRunMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Redis-primary, JDBC-fallback {@link RunStore}.
 *
 * <p>Hot state is a JSON blob at {@code agent:run:hot:{runId}} (TTL 24h). The
 * JDBC mirror is authoritative across restarts and after Redis TTL eviction.
 */
@Slf4j
@Component
public class DefaultRunStore implements RunStore {

    private static final String HOT_KEY_PREFIX = "agent:run:hot:";
    private static final long HOT_TTL_HOURS = 24;

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;
    private final AgentRunMapper runMapper;

    public DefaultRunStore(StringRedisTemplate redis, ObjectMapper objectMapper,
                           AgentRunMapper runMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
        this.runMapper = runMapper;
    }

    @Override
    public void saveHot(AgentRun run) {
        if (run == null || run.getRunId() == null) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(run);
            redis.opsForValue().set(HOT_KEY_PREFIX + run.getRunId(), json, HOT_TTL_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("RunStore Redis save failed for {}: {}", run.getRunId(), e.getMessage());
        }
    }

    @Override
    public void persist(AgentRun run) {
        if (run == null || run.getRunId() == null) {
            return;
        }
        try {
            runMapper.upsertByRunId(toEntity(run));
        } catch (Exception e) {
            log.warn("RunStore JDBC save failed for {}: {}", run.getRunId(), e.getMessage());
        }
    }

    @Override
    public AgentRun load(String runId) {
        if (runId == null || runId.isEmpty()) {
            return null;
        }
        AgentRun run = null;
        try {
            String json = redis.opsForValue().get(HOT_KEY_PREFIX + runId);
            if (json != null && !json.isEmpty()) {
                run = objectMapper.readValue(json, AgentRun.class);
            }
        } catch (Exception e) {
            log.warn("RunStore Redis load failed for {}: {}", runId, e.getMessage());
        }
        if (run != null) {
            return run;
        }
        try {
            AgentRunEntity entity = runMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<AgentRunEntity>()
                            .eq(AgentRunEntity::getRunId, runId));
            if (entity != null) {
                run = fromEntity(entity);
            }
        } catch (Exception e) {
            log.warn("RunStore JDBC load failed for {}: {}", runId, e.getMessage());
        }
        return run;
    }

    private AgentRunEntity toEntity(AgentRun run) {
        AgentRunEntity entity = new AgentRunEntity();
        entity.setRunId(run.getRunId());
        entity.setConversationId(run.getConversationId());
        entity.setParentRunId(run.getParentRunId());
        entity.setUserId(run.getUserId());
        entity.setTenantId(run.getTenantId());
        entity.setModel(run.getModel());
        entity.setMode(run.getMode());
        entity.setSpaceId(run.getSpaceId());
        entity.setPageId(run.getPageId());
        entity.setStatus(run.getStatus());
        entity.setFinishReason(run.getFinishReason());
        entity.setSuspendReason(run.getSuspendReason());
        entity.setErrorCode(run.getErrorCode());
        entity.setErrorMessage(run.getErrorMessage());
        entity.setLastSeq(run.getLastSeq());
        entity.setPromptTokens((int) run.getPromptTokens());
        entity.setCompletionTokens((int) run.getCompletionTokens());
        entity.setCachedPromptTokens((int) run.getCachedPromptTokens());
        entity.setCreateTime(run.getCreateTime());
        entity.setUpdateTime(run.getUpdateTime());
        return entity;
    }

    private AgentRun fromEntity(AgentRunEntity entity) {
        AgentRun run = new AgentRun();
        run.setRunId(entity.getRunId());
        run.setConversationId(entity.getConversationId());
        run.setParentRunId(entity.getParentRunId());
        run.setUserId(entity.getUserId());
        run.setTenantId(entity.getTenantId());
        run.setModel(entity.getModel());
        run.setMode(entity.getMode());
        run.setSpaceId(entity.getSpaceId());
        run.setPageId(entity.getPageId());
        run.setStatus(entity.getStatus());
        run.setFinishReason(entity.getFinishReason());
        run.setSuspendReason(entity.getSuspendReason());
        run.setErrorCode(entity.getErrorCode());
        run.setErrorMessage(entity.getErrorMessage());
        run.setLastSeq(entity.getLastSeq() != null ? entity.getLastSeq() : 0);
        run.setPromptTokens(entity.getPromptTokens() != null ? entity.getPromptTokens() : 0);
        run.setCompletionTokens(entity.getCompletionTokens() != null ? entity.getCompletionTokens() : 0);
        run.setCachedPromptTokens(entity.getCachedPromptTokens() != null ? entity.getCachedPromptTokens() : 0);
        run.setCreateTime(entity.getCreateTime());
        run.setUpdateTime(entity.getUpdateTime());
        return run;
    }
}
