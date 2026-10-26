package com.knowledge.agent.core.web.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.util.List;

/**
 * A user utterance addressed to a run that is already executing ("mid-run
 * steering"). The run folds it into the conversation at its next safe boundary
 * — between two model calls — so it redirects the work without cutting off text
 * that is already streaming.
 */
@Data
@ApiModel("Message for a running agent run")
public class SendRunMessageRequest {

    @ApiModelProperty("User message text")
    private String content;

    @ApiModelProperty("Multimodal content parts (text + image_url), optional")
    private List<Object> contentParts;
}
