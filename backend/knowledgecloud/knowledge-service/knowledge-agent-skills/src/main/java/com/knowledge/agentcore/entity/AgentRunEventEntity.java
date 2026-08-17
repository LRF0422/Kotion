package com.knowledge.agentcore.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_run_event} table — the cold-tier
 * append-only event log. Replay is ordered by (run_id, seq).
 */
@Data
@TableName("agent_run_event")
public class AgentRunEventEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String runId;

    /** Monotonic event sequence within the run. */
    private Long seq;

    /** Event type (run.created, text.delta, tool.requested, ...). */
    private String eventType;

    /** JSON payload exactly as streamed over SSE (minus seq). */
    private String payload;

    private Long createTime;
}
