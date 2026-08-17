package com.knowledge.agentcore.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_long_memory} table — cross-session
 * long-term memory entries with hierarchical scope (user / user+space /
 * user+space+page). Redis ({@code agent:memory:*}) is the hot tier.
 */
@Data
@TableName("agent_long_memory")
public class AgentLongMemoryEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Memory entry id (UUID). */
    private String memoryId;

    /** Scope key: u:{userId} / u:{userId}:s:{spaceId} / u:{userId}:s:{spaceId}:p:{pageId}. */
    private String scope;

    private Long userId;

    private Long tenantId;

    private String spaceId;

    private String pageId;

    /** fact | preference | note | episode */
    private String type;

    private String content;

    /** Importance score (0-100). */
    private Integer importance;

    /** Comma-separated tags. */
    private String tags;

    /** Reserved: external embedding store reference. */
    private String embeddingRef;

    private Long createTime;

    private Long updateTime;

    private Long lastAccessTime;
}
