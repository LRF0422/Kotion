package com.knowledge.agent.api.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Agent session DTO")
public class AgentSessionDTO {

    @ApiModelProperty("Session id")
    private String sessionId;

    @ApiModelProperty("Conversation id")
    private String conversationId;

    @ApiModelProperty("Execution mode: SOLO | TEAM")
    private String executionMode;

    @ApiModelProperty("Original user task")
    private String task;

    @ApiModelProperty("Status: RUNNING | COMPLETED | FAILED")
    private String status;

    @ApiModelProperty("Final result")
    private String result;

    @ApiModelProperty("Create time")
    private LocalDateTime createTime;

    @ApiModelProperty("End time")
    private LocalDateTime endTime;
}
