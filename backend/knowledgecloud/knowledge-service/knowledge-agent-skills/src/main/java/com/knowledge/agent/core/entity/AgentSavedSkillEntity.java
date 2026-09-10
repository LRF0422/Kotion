package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/** MyBatis entity for an owner-scoped skill compiled from a conversation. */
@Data
@TableName("agent_saved_skill")
public class AgentSavedSkillEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String skillId;

    private Long tenantId;

    private Long userId;

    private String name;

    private String description;

    private String triggerText;

    private String exampleIntentsJson;

    private String tagsJson;

    private String systemPromptFragment;

    private String requiredToolNamesJson;

    private String optionalToolNamesJson;

    private String sourceConversationId;

    private String sourceRunId;

    private String sourceSchemaVersion;

    private String sourceFingerprint;

    private Boolean enabled;

    private Integer version;

    private Long useCount;

    private Long lastUsedTime;

    private String embeddingRef;

    private Long createTime;

    private Long updateTime;
}
