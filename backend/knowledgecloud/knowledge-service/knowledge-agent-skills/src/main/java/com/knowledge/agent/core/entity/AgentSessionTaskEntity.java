package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for {@code agent_session_task} — the cross-session index
 * of a chat session's task list.
 *
 * <p>One row per {@code update_todos} item of the session's <b>latest</b>
 * whole-list snapshot; the engine rewrites the whole snapshot on every
 * {@code update_todos} call (see {@code SessionTaskRecorder}). The durable
 * truth of a turn's list stays in the run log / transcript projection; this
 * table only exists so the UI can find unfinished work across sessions.
 */
@Data
@TableName("agent_session_task")
public class AgentSessionTaskEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long userId;

    /** Session id (frontend session id == conversationId). */
    private String sessionId;

    /** {@code update_todos} item id. */
    private String itemId;

    private String title;

    /** pending | in_progress | completed. */
    private String status;

    /** Position of the item within the whole-list snapshot. */
    private Integer sortIndex;

    /** Run that last wrote this row (audit only). */
    private String runId;

    private Long createTime;

    private Long updateTime;
}
