package com.knowledge.wiki.service.entity.dto;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class SpaceMemberDTO {
    private Long id;
    private String name;
    private String email;
    private String avatar;
    private String role;
    private LocalDateTime joinedAt;
}