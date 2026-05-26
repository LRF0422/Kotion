package com.knowledge.system.domain.permission;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import com.knowledge.system.domain.enums.GlobalPermissionItem;
import com.knowledge.system.domain.permission.enums.AccessType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName("knowledge_permission")
public class Permission extends TenantItemImpl {

	@TableId
	private Long id;
	private Long roleId;
	private String permission;
	private Long objectId;
	private AccessType accessType;
	private Boolean isDefault;

}
