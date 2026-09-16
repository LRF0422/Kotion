package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_chat_session} table — the
 * engine-written PROJECTION CACHE of one AI side-panel chat session.
 *
 * <p>The durable truth is the run log ({@code agent_run_checkpoint} holds the
 * full model-visible conversation; {@code agent_run_event} the execution
 * events). This table is a derived read model materialized by
 * {@code SessionTranscriptProjector} so the client can list and load sessions
 * without replaying every run. JSON columns are opaque strings at this layer.
 */
@Data
@TableName("agent_chat_session")
public class AgentChatSessionEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Session id (frontend session id == conversationId / threadId). */
    private String sessionId;

    private Long tenantId;

    private Long userId;

    /** Conversation title. */
    private String title;

    /** JSON ChatTargetPage the agent edits off-screen (client-owned UI meta). */
    private String targetPageJson;

    /** JSON ChatTargetPage this session belongs to (client-owned UI meta). */
    private String boundPageJson;

    /** JSON array of projected UI messages (engine-written display read model). */
    private String messagesJson;

    /** Canonical ChatMessage[] — engine-owned context history (source of truth). */
    private String modelMessagesJson;

    /** Cached length of {@link #messagesJson}. */
    private Integer messageCount;

    /** Projection schema version. */
    private Integer schemaVersion;

    /** Run whose terminal checkpoint produced this projection. */
    private String sourceRunId;

    /** Run event seq reflected by this projection. */
    private Long asOfSeq;

    /** Optimistic-lock version, bumped by every transcript write (CAS). */
    private Long version;

    private Long createTime;

    private Long updateTime;
}
