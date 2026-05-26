package com.knowledge.wiki.service.entity.dto;

import java.util.List;
import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CollaborationInvitationRequestDTO {
    @NotNull(message = "空间ID不能为空")
    private Long spaceId;
    @NotNull(message = "页面ID不能为空")
    private Long pageId;
    private List<Long> collaboratorIds;
    private List<String> collaboratorEmails;
    private List<String> permissions;
    private String message;
}