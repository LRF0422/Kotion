package com.knowledge.system.dto;

import java.io.Serializable;
import java.time.LocalDateTime;

import lombok.Data;

@Data
public class AuthSessionDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String sessionKey;
    private Long userId;
    private String audience;
    private String contextType;
    private String contextId;
    private String refreshTokenHash;
    private Integer authVersion;
    private LocalDateTime issuedAt;
    private LocalDateTime expiresAt;
    private LocalDateTime lastSeenAt;
    private String deviceName;
    private String remoteIp;
    private String userAgent;
}
