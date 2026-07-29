package com.knowledge.agent.store.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * MyBatis-Plus entity for the {@code agent_definition} table — a user-defined
 * agent (system prompt + model + tool set + iteration budget) usable both as
 * a chat entry point ({@code ChatCompletionRequest.agentId}) and as a
 * delegation target ({@code delegate_task(agent_name)}).
 *
 * <p>
 * Tenant/user isolation is enforced explicitly in the service layer
 * (the mapper bypasses the tenant-line interceptor, matching the other
 * agent store mappers).
 */
@Data
@TableName("agent_definition")
public class AgentDefinitionEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    /** Owner (creator) of the definition. */
    private Long userId;

    /** Display/delegation name; unique within a tenant. */
    private String name;

    private String description;

    private String systemPrompt;

    /** Model to use; null = model from the chat request / default. */
    private String modelName;

    /** JSON array of backend tool ids; null or empty = all backend tools. */
    private String toolIds;

    /** Max iterations per run; null = engine default. */
    private Integer maxIterations;

    private Boolean enabled;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
