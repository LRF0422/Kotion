package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.knowledge.core.mp.config.jackson.EnumListDeserializer;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.wiki.service.entity.enums.PagePermissionEnum;

import lombok.Data;

@Data
public class CollaborationInvitationDTO implements Serializable {

    private List<KnowledgeUser> users;
    @JsonDeserialize(using = EnumListDeserializer.class)
    private List<PagePermissionEnum> permissions;
    private Long pageId;
    private Long spaceId;
    private List<String> collaboratorEmails;

}
