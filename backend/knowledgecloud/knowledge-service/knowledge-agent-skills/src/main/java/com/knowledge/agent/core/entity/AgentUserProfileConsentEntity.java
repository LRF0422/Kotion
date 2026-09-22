package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for {@code agent_user_profile_consent} — the opt-in that
 * gates all profile extraction. Absent/disabled means "derive nothing".
 */
@Data
@TableName("agent_user_profile_consent")
public class AgentUserProfileConsentEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long userId;

    private Boolean enabled;

    private Long agreedAt;

    private Long createTime;

    private Long updateTime;
}
