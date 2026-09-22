package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for {@code agent_user_profile_evidence} — the redacted,
 * truncated supporting text behind one trait. Only ever shown to the owning
 * user; never returned by the internal recommendation endpoint.
 */
@Data
@TableName("agent_user_profile_evidence")
public class AgentUserProfileEvidenceEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long userId;

    private String traitId;

    private String sessionId;

    private String runId;

    /** Redacted + truncated supporting text. */
    private String excerpt;

    private Long observedAt;

    private Long createTime;
}
