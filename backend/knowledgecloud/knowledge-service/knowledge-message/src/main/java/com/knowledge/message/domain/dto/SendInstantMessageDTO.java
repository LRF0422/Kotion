package com.knowledge.message.domain.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;

/**
 * DTO for sending instant message
 */
@Data
@ApiModel(description = "Send Instant Message Request")
public class SendInstantMessageDTO {

    @NotNull(message = "Receiver ID is required")
    @ApiModelProperty(value = "Receiver user ID", required = true)
    private Long receiverId;

    @NotBlank(message = "Message content is required")
    @ApiModelProperty(value = "Message content", required = true)
    private String content;

    @ApiModelProperty(value = "Content type: TEXT, IMAGE, FILE, LINK (default: TEXT)")
    private String contentType = "TEXT";

    @ApiModelProperty(value = "Reply to message ID (optional)")
    private Long replyToMessageId;

    @ApiModelProperty(value = "Extra data in JSON format (optional)")
    private String extraData;
}
