package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ShareLinkResponseDTO {
    private String link;
    private String shortCode;
    private LocalDateTime expiresAt;
    private Boolean isPublic;
    private String permission;
    private LocalDateTime createdAt;
}