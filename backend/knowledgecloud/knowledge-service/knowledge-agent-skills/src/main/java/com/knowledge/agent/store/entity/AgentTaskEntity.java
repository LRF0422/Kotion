package com.knowledge.agent.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_task} table — a durable mirror of an
 * async long-running agent job (see {@code com.knowledge.agent.v2.job.AgentJob}).
 *
 * <p>Redis is the primary read/write path; this table is the cold fallback so a
 * job can be resolved after the Redis TTL evicts it. Timestamps are epoch millis.
 */
@Data
@TableName("agent_task")
public class AgentTaskEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String taskId;

    private String sessionId;

    private String conversationId;

    private Long userId;

    private Long tenantId;

    private String status;

    private String finishReason;

    private Integer promptTokens;

    private Integer completionTokens;

    private Integer totalTokens;

    private String errorMessage;

    private Long createTime;

    private Long updateTime;
}
