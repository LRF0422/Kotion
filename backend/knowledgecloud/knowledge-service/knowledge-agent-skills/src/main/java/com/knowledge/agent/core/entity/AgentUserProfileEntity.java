package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_user_profile} table — derived,
 * low-sensitivity user traits consumed by recommendation (NOT by the agent
 * prompt as memory; see {@link AgentLongMemoryEntity} for that).
 *
 * <p>A row is one (dimension, value) assertion. The unique key
 * (tenant,user,dimension,value) makes extraction idempotent, and a row kept at
 * {@code status='suppressed'} occupies that key so a user deletion can never be
 * resurrected by a later extraction.
 */
@Data
@TableName("agent_user_profile")
public class AgentUserProfileEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Trait id (UUID). */
    private String traitId;

    private Long tenantId;

    private Long userId;

    /** Allowlisted dimension (occupation / industry / ...). */
    private String dimension;

    /** Trait value. */
    private String traitValue;

    /** Confidence 0-100. */
    private Integer confidence;

    /** inferred | user. */
    private String source;

    /** active | suppressed. */
    private String status;

    /** User-owned: the extractor must not overwrite value/confidence. */
    private Boolean locked;

    /** Number of supporting observations. */
    private Integer evidenceCount;

    private Long firstSeen;

    private Long lastSeen;

    /** Epoch millis; 0 = never expires. */
    private Long expiresAt;

    private Long createTime;

    private Long updateTime;
}
