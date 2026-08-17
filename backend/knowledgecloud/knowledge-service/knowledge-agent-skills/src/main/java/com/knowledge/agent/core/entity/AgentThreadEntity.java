package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_thread} table — a conversation
 * thread: title, LLM-generated summary (session memory tier) and the current
 * active run pointer (single-active-run invariant).
 */
@Data
@TableName("agent_thread")
public class AgentThreadEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Conversation id (JSON contract: conversationId). */
    private String threadId;

    private Long userId;

    private Long tenantId;

    /** Conversation title. */
    private String title;

    /** LLM-generated conversation summary (session memory). */
    private String summary;

    /** Current active run id. */
    private String activeRunId;

    private Long createTime;

    private Long updateTime;
}
