package com.knowledge.wiki.service.entity.dto;

import lombok.Data;

@Data
public class ShareLinkRequestDTO {
    private Boolean isPublic;
    private Integer expiresIn;
    private String permission;
}