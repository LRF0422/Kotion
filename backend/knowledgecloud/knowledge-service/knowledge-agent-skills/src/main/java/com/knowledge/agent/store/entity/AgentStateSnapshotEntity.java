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
 * MyBatis-Plus entity for the {@code agent_state_snapshot} table.
 *
 * <p>
 * Maps a row in the snapshot table. The full {@link com.knowledge.agent.store.AgentStateSnapshot}
 * JSON is stored in the {@code snapshot} column; the other indexed columns
 * (session_id, conversation_id, timestamp, etc.) are extracted for efficient
 * querying without deserializing the JSON.
 *
 * <p>
 * This entity does <b>not</b> extend {@code BaseEntity} or {@code TenantEntity}
 * because agent state snapshots are global (not tenant-scoped) and do not
 * carry create_user / update_user / is_deleted columns.
 */
@Data
@TableName("agent_state_snapshot")
public class AgentStateSnapshotEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String sessionId;

    private String conversationId;

    private String agentId;

    private String parentAgentId;

    private Integer depth;

    private Integer iteration;

    /** Full JSON serialization of {@link com.knowledge.agent.store.AgentStateSnapshot}. */
    private String snapshot;

    private Long timestamp;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
