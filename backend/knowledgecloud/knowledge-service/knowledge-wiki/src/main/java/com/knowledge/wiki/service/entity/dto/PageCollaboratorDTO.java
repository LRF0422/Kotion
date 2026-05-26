package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class PageCollaboratorDTO {
    private Long id;
    private String name;
    private String username;
    private String email;
    private String avatar;
    private String permission;
    private LocalDateTime invitedAt;
    private InvitedBy invitedBy;

    @Data
    public static class InvitedBy {
        private Long id;
        private String name;
    }
}