package com.knowledge.agent.v2.job;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.entity.AgentTaskEntity;
import com.knowledge.agent.store.mapper.AgentTaskMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Redis-primary, JDBC-fallback implementation of {@link AgentJobStore}.
 */
@Slf4j
@Component
public class DefaultAgentJobStore implements AgentJobStore {

    private static final String KEY_PREFIX = "agent:job:";
    private static final long TTL_HOURS = 24;

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final AgentTaskMapper taskMapper;

    public DefaultAgentJobStore(StringRedisTemplate redisTemplate,
            ObjectMapper objectMapper,
            AgentTaskMapper taskMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.taskMapper = taskMapper;
    }

    @Override
    public void save(AgentJob job) {
        if (job == null) {
            return;
        }
        saveHot(job);
        try {
            taskMapper.upsertByTaskId(toEntity(job));
        } catch (Exception e) {
            log.warn("AgentJobStore JDBC save failed for {}: {}", job.getTaskId(), e.getMessage());
        }
    }

    @Override
    public void saveHot(AgentJob job) {
        if (job == null) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(toPayload(job));
            redisTemplate.opsForValue().set(KEY_PREFIX + job.getTaskId(), json, TTL_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("AgentJobStore Redis save failed for {}: {}", job.getTaskId(), e.getMessage());
        }
    }

    @Override
    public AgentJob load(String taskId) {
        if (taskId == null || taskId.isEmpty()) {
            return null;
        }
        AgentJob job = null;
        try {
            String json = redisTemplate.opsForValue().get(KEY_PREFIX + taskId);
            if (json != null && !json.isEmpty()) {
                job = fromPayload(objectMapper.readValue(json, JobPayload.class));
            }
        } catch (Exception e) {
            log.warn("AgentJobStore Redis load failed for {}: {}", taskId, e.getMessage());
        }
        if (job != null) {
            return job;
        }
        try {
            AgentTaskEntity entity = taskMapper.selectOne(new LambdaQueryWrapper<AgentTaskEntity>()
                    .eq(AgentTaskEntity::getTaskId, taskId));
            if (entity != null) {
                job = fromEntity(entity);
            }
        } catch (Exception e) {
            log.warn("AgentJobStore JDBC load failed for {}: {}", taskId, e.getMessage());
        }
        return job;
    }

    @Override
    public void delete(String taskId) {
        try {
            redisTemplate.delete(KEY_PREFIX + taskId);
        } catch (Exception e) {
            log.warn("AgentJobStore Redis delete failed for {}: {}", taskId, e.getMessage());
        }
        try {
            taskMapper.delete(new LambdaQueryWrapper<AgentTaskEntity>()
                    .eq(AgentTaskEntity::getTaskId, taskId));
        } catch (Exception e) {
            log.warn("AgentJobStore JDBC delete failed for {}: {}", taskId, e.getMessage());
        }
    }

    @Override
    public List<AgentJob> listByUser(Long userId, int limit) {
        List<AgentJob> out = new ArrayList<>();
        try {
            List<AgentTaskEntity> rows = taskMapper.selectList(
                    new LambdaQueryWrapper<AgentTaskEntity>()
                            .eq(AgentTaskEntity::getUserId, userId)
                            .orderByDesc(AgentTaskEntity::getCreateTime)
                            .last("LIMIT " + Math.max(1, Math.min(limit, 100))));
            for (AgentTaskEntity entity : rows) {
                out.add(fromEntity(entity));
            }
        } catch (Exception e) {
            log.warn("AgentJobStore listByUser failed for {}: {}", userId, e.getMessage());
        }
        return out;
    }

    // ---- Payload mapping ----

    private JobPayload toPayload(AgentJob job) {
        JobPayload p = new JobPayload();
        p.taskId = job.getTaskId();
        p.sessionId = job.getSessionId();
        p.conversationId = job.getConversationId();
        p.userId = job.getUserId();
        p.tenantId = job.getTenantId();
        p.status = job.getStatus().name();
        p.finishReason = job.getFinishReason();
        p.errorMessage = job.getErrorMessage();
        p.promptTokens = job.getPromptTokens();
        p.completionTokens = job.getCompletionTokens();
        p.lastSeq = job.getLastSeq();
        p.assistantText = job.getAssistantText();
        p.createdAt = job.getCreatedAt();
        p.updatedAt = job.getUpdatedAt();
        return p;
    }

    private AgentJob fromPayload(JobPayload p) {
        AgentJob job = new AgentJob(p.taskId, p.sessionId, p.conversationId, p.userId, p.tenantId);
        job.setStatus(safeStatus(p.status));
        job.setFinishReason(p.finishReason);
        job.setErrorMessage(p.errorMessage);
        job.addUsage(p.promptTokens, p.completionTokens);
        job.setLastSeq(p.lastSeq);
        job.setAssistantText(p.assistantText);
        return job;
    }

    private AgentJob fromEntity(AgentTaskEntity e) {
        AgentJob job = new AgentJob(e.getTaskId(), e.getSessionId(), e.getConversationId(),
                e.getUserId(), e.getTenantId());
        job.setStatus(safeStatus(e.getStatus()));
        job.setFinishReason(e.getFinishReason());
        job.setErrorMessage(e.getErrorMessage());
        job.addUsage(e.getPromptTokens() != null ? e.getPromptTokens() : 0,
                e.getCompletionTokens() != null ? e.getCompletionTokens() : 0);
        job.setLastSeq(e.getLastSeq() != null ? e.getLastSeq() : 0L);
        job.setAssistantText(e.getAssistantText());
        return job;
    }

    private AgentJobStatus safeStatus(String s) {
        try {
            return s == null ? AgentJobStatus.QUEUED : AgentJobStatus.valueOf(s);
        } catch (IllegalArgumentException e) {
            return AgentJobStatus.QUEUED;
        }
    }

    private AgentTaskEntity toEntity(AgentJob job) {
        AgentTaskEntity e = new AgentTaskEntity();
        e.setTaskId(job.getTaskId());
        e.setSessionId(job.getSessionId());
        e.setConversationId(job.getConversationId());
        e.setUserId(job.getUserId());
        e.setTenantId(job.getTenantId());
        e.setStatus(job.getStatus().name());
        e.setFinishReason(job.getFinishReason());
        e.setPromptTokens(job.getPromptTokens());
        e.setCompletionTokens(job.getCompletionTokens());
        e.setTotalTokens(job.getPromptTokens() + job.getCompletionTokens());
        e.setErrorMessage(job.getErrorMessage());
        e.setLastSeq(job.getLastSeq());
        e.setAssistantText(job.getAssistantText());
        e.setCreateTime(job.getCreatedAt());
        e.setUpdateTime(job.getUpdatedAt());
        return e;
    }

    /** JSON-mirror of an {@link AgentJob} (plain fields for Jackson). */
    public static class JobPayload {
        public String taskId;
        public String sessionId;
        public String conversationId;
        public Long userId;
        public Long tenantId;
        public String status;
        public String finishReason;
        public String errorMessage;
        public int promptTokens;
        public int completionTokens;
        public long lastSeq;
        public String assistantText;
        public long createdAt;
        public long updatedAt;
    }
}
