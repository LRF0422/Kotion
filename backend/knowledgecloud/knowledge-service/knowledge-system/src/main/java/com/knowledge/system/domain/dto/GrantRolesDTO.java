package com.knowledge.system.domain.dto;

import java.io.Serializable;
import java.util.List;

import lombok.Data;

@Data
public class GrantRolesDTO implements Serializable {

    private Long userId;
    private List<Long> roleIds;

    private Long roleId;
    private List<Long> userIds;

}
