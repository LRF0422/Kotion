package com.knowledge.system.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class AuthSessionValidationDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private String sessionKey;
    private String refreshTokenHash;
    private Integer authVersion;
}
