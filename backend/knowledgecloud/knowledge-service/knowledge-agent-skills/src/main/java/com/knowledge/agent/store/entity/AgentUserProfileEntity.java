package com.knowledge.agent.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_user_profile} table — per-user agent
 * profile (画像). One row per (user, tenant).
 */
@Data
@TableName("agent_user_profile")
public class AgentUserProfileEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private Long tenantId;

    /** Full structured profile JSON (see {@code UserProfile}). */
    private String profileJson;

    private String language;

    private String preferredModel;

    /** JSON map toolId -> usage count. */
    private String toolUsageJson;

    /** JSON map skillName -> usage count. */
    private String skillUsageJson;

    private Integer interactionCount;

    private Integer totalTokens;

    private Long createTime;

    private Long updateTime;
}
