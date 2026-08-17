package com.knowledge.agentcore.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for the {@code agent_run_checkpoint} table — the latest
 * serializable run snapshot per run (crash recovery = snapshot + event replay).
 */
@Data
@TableName("agent_run_checkpoint")
public class AgentRunCheckpointEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String runId;

    /** Event seq at snapshot time. */
    private Long seq;

    /** Full serializable run state (JSON). */
    private String stateJson;

    private Long createTime;
}
