package com.knowledge.agent.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_task_event} table — the cold
 * durable tier of a task's event log (Redis ZSET is the hot tier).
 */
@Data
@TableName("agent_task_event")
public class AgentTaskEventEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String taskId;

    private Long seq;

    private String eventType;

    private String payload;

    private Long createTime;
}
