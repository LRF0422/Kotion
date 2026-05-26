package com.knowledge.system.domain.permission.dto;

import com.knowledge.core.common.base.PageDTO;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
public class RoleQueryDTO extends PageDTO {

    private boolean withResources = false;
}
