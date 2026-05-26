package com.knowledge.system.domain.dto;

import com.knowledge.core.common.base.PageDTO;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
public class GroupMemberQueryDTO extends PageDTO {
	private Long groupId;
}
