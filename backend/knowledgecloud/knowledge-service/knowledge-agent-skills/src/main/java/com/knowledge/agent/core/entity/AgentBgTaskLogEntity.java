package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * One incremental log line of a background task ({@code agent_bg_task_log}).
 *
 * <p>{@code seq} is monotonic per task and assigned by the server while the
 * task row is locked. {@code (taskId, batchId, batchSeq)} is unique, so a
 * client retry of the same batch is idempotent.
 */
@Data
@TableName("agent_bg_task_log")
public class AgentBgTaskLogEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String taskId;

    /** Monotonic seq within the task, starting at 1. */
    private Long seq;

    /** Client batch idempotency key. */
    private String batchId;

    /** Index within the batch (0..n-1). */
    private Integer batchSeq;

    /** log | summary | state. */
    private String kind;

    /** debug | info | warn | error. */
    private String level;

    private String message;

    /** Client-side timestamp (epoch millis). */
    private Long at;

    private Long createTime;
}