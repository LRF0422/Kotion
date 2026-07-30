package com.knowledge.agent.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * MyBatis-Plus entity for the {@code agent_usage_record} table.
 *
 * <p>
 * One row per agent session, recording token usage for cost accounting.
 * Upserted by {@code session_id} (unique key) so a suspend → resume cycle
 * of the same session never double-counts tokens.
 *
 * <p>
 * Like {@link AgentStateSnapshotEntity}, this entity does <b>not</b> extend
 * {@code BaseEntity} — usage records are global and immutable audit data.
 */
@Data
@TableName("agent_usage_record")
public class AgentUsageRecordEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String sessionId;

    private String conversationId;

    private Long userId;

    private Long tenantId;

    private String userName;

    private String modelName;

    private Integer promptTokens;

    private Integer completionTokens;

    private Integer totalTokens;

    private Long durationMs;

    private String finishReason;

    private LocalDateTime createTime;
}
