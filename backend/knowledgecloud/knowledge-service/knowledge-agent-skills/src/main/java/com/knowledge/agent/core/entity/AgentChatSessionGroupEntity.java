package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for {@code agent_session_group} — one user-created
 * conversation folder in the AI chat session list.
 *
 * <p>The group id is CLIENT-generated (like {@code session_id}) so an offline
 * browser can create a group and later merge it without an id round-trip; the
 * database identity ({@link #id}) is never exposed through the API.
 */
@Data
@TableName("agent_session_group")
public class AgentChatSessionGroupEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Client-generated group id (stable across devices). */
    private String groupId;

    private Long tenantId;

    private Long userId;

    /** Display name (trimmed, bounded by the controller). */
    private String name;

    /** Position in the sidebar list; ascending. */
    private Integer sortIndex;

    private Long createTime;

    private Long updateTime;
}