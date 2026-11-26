package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * Server-side form request ({@code agent_form_request}).
 *
 * <p>{@code requestUserForm} used to live only in the renderer registry, so a
 * refresh lost the form. This row keeps the schema, answer and delivery state;
 * the client inbox reads it and the tool resumes from the same form id.
 */
@Data
@TableName("agent_form_request")
public class AgentFormRequestEntity implements Serializable {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_ANSWERED = "answered";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_EXPIRED = "expired";

    @TableId(type = IdType.AUTO)
    private Long id;

    private String formId;

    private String conversationId;

    private String runId;

    private String callId;

    private Long tenantId;

    private Long userId;

    private String title;

    /** Full normalized schema (fields / batch / description / submitLabel). */
    private String schemaJson;

    /** pending | answered | cancelled | expired */
    private String status;

    private String valuesJson;

    private String rowsJson;

    private String cancelReason;

    private Long createdAt;

    private Long answeredAt;

    private Long deliveredAt;

    private Long expiresAt;
}