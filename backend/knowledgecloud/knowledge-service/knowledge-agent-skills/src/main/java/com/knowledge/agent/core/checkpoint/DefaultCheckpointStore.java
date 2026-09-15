package com.knowledge.agent.core.checkpoint;

import com.knowledge.agent.core.config.AgentCoreProperties;
import com.knowledge.agent.core.entity.AgentRunCheckpointEntity;
import com.knowledge.agent.core.mapper.AgentRunCheckpointMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Redis-primary, JDBC-authoritative {@link CheckpointStore}. JDBC write is
 * synchronous (upsert of the single latest row per run); Redis is the fast
 * read path for hot recovery.
 */
@Slf4j
@Component
public class DefaultCheckpointStore implements CheckpointStore {

    private static final String KEY_PREFIX = "agent:run:checkpoint:";
    private static final long TTL_HOURS = 24;

    private final StringRedisTemplate redis;
    private final AgentRunCheckpointMapper checkpointMapper;
    private final CheckpointCodec codec;
    private final AgentCoreProperties properties;

    public DefaultCheckpointStore(StringRedisTemplate redis,
                                  AgentRunCheckpointMapper checkpointMapper,
                                  CheckpointCodec codec,
                                  AgentCoreProperties properties) {
        this.redis = redis;
        this.checkpointMapper = checkpointMapper;
        this.codec = codec;
        this.properties = properties;
    }

    @Override
    public void save(Checkpoint checkpoint) {
        if (!properties.getCheckpoint().isEnabled() || checkpoint == null || checkpoint.getRunId() == null) {
            return;
        }
        checkpoint.setCreateTime(System.currentTimeMillis());
        String json = codec.toJson(checkpoint);
        try {
            redis.opsForValue().set(KEY_PREFIX + checkpoint.getRunId(), json, TTL_HOURS, TimeUnit.HOURS);
        } catch (Exception e) {
            log.warn("CheckpointStore Redis save failed for {}: {}",
                    checkpoint.getRunId(), e.getMessage());
            // Never let a stale hot checkpoint shadow the newer JDBC snapshot.
            try {
                redis.delete(KEY_PREFIX + checkpoint.getRunId());
            } catch (Exception ignored) {
                // best effort
            }
        }
        try {
            AgentRunCheckpointEntity entity = new AgentRunCheckpointEntity();
            entity.setRunId(checkpoint.getRunId());
            entity.setSeq(checkpoint.getSeq());
            entity.setStateJson(json);
            entity.setCreateTime(checkpoint.getCreateTime());
            checkpointMapper.upsertByRunId(entity);
        } catch (Exception e) {
            log.warn("CheckpointStore JDBC save failed for {}: {}",
                    checkpoint.getRunId(), e.getMessage());
        }
    }

    @Override
    public Checkpoint load(String runId) {
        if (runId == null || runId.isEmpty()) {
            return null;
        }
        Checkpoint hot = null;
        try {
            String json = redis.opsForValue().get(KEY_PREFIX + runId);
            if (json != null && !json.isEmpty()) {
                hot = codec.fromJson(json);
            }
        } catch (Exception e) {
            log.warn("CheckpointStore Redis load failed for {}: {}", runId, e.getMessage());
        }
        AgentRunCheckpointEntity entity = null;
        try {
            entity = checkpointMapper.selectByRunId(runId);
        } catch (Exception e) {
            log.warn("CheckpointStore JDBC load failed for {}: {}", runId, e.getMessage());
        }
        // Prefer the newer snapshot: a lower-seq hot copy must not roll the
        // conversation back past a newer JDBC one.
        if (hot != null && entity != null) {
            if (entity.getSeq() != null && entity.getSeq() > hot.getSeq()) {
                return codec.fromJson(entity.getStateJson());
            }
            return hot;
        }
        if (hot != null) {
            return hot;
        }
        if (entity != null) {
            return codec.fromJson(entity.getStateJson());
        }
        return null;
    }
}
