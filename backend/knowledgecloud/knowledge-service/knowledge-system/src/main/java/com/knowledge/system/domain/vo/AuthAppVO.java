package com.knowledge.system.domain.vo;

import java.io.Serializable;

import com.knowledge.system.domain.enums.AppType;
import com.knowledge.system.domain.permission.enums.AccessType;

import lombok.Data;

@Data
public class AuthAppVO implements Serializable {

    private Long id;
    private String icon;
    private String name;
    private String description;
    private AppType appType;
    private AccessType accessType;
    private String clientId;

}
