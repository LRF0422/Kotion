package com.knowledge.message.domain.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import javax.validation.constraints.NotNull;
import java.util.List;

/**
 * DTO for marking messages as read
 */
@Data
@ApiModel(description = "Mark Messages as Read Request")
public class MarkAsReadDTO {

    @ApiModelProperty(value = "Single message ID to mark as read")
    private Long messageId;

    @ApiModelProperty(value = "List of message IDs to mark as read")
    private List<Long> messageIds;

    @ApiModelProperty(value = "Mark all messages from this sender as read")
    private Long senderId;

    @ApiModelProperty(value = "Conversation ID to mark all messages as read")
    private String conversationId;
}
