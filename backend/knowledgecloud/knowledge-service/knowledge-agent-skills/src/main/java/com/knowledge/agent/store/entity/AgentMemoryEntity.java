package com.knowledge.agent.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_memory} table — durable cross-session
 * long-term memory (see {@code com.knowledge.agent.v2.memory.MemoryEntry}).
 *
 * <p>Redis is the hot path; this table is the cold fallback and source of truth.
 */
@Data
@TableName("agent_memory")
public class AgentMemoryEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String memoryId;

    /** Scope key, e.g. {@code u:<userId>:t:<tenantId>}. */
    private String scope;

    private Long userId;

    private Long tenantId;

    /** fact | preference | note */
    private String type;

    private String content;

    private Integer importance;

    private String tags;

    private Long createTime;

    private Long updateTime;

    private Long lastAccessTime;
}
