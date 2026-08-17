package com.knowledge.agentcore.checkpoint;

import com.knowledge.agentcore.config.AgentCoreProperties;
import com.knowledge.agentcore.entity.AgentRunCheckpointEntity;
import com.knowledge.agentcore.mapper.AgentRunCheckpointMapper;
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
        try {
            String json = redis.opsForValue().get(KEY_PREFIX + runId);
            if (json != null && !json.isEmpty()) {
                return codec.fromJson(json);
            }
        } catch (Exception e) {
            log.warn("CheckpointStore Redis load failed for {}: {}", runId, e.getMessage());
        }
        try {
            AgentRunCheckpointEntity entity = checkpointMapper.selectByRunId(runId);
            if (entity != null) {
                return codec.fromJson(entity.getStateJson());
            }
        } catch (Exception e) {
            log.warn("CheckpointStore JDBC load failed for {}: {}", runId, e.getMessage());
        }
        return null;
    }
}
