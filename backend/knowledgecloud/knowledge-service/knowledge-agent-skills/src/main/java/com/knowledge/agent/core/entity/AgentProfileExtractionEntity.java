package com.knowledge.agent.core.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;

/**
 * MyBatis-Plus entity for {@code agent_profile_extraction} — per-session
 * watermark so a session is not re-extracted on every completed run.
 */
@Data
@TableName("agent_profile_extraction")
public class AgentProfileExtractionEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long userId;

    private String sessionId;

    /** Length of the canonical model log already processed. */
    private Integer extractedMessageCount;

    private String lastRunId;

    private String model;

    /** ok | failed. */
    private String status;

    private Long createTime;

    private Long updateTime;
}
