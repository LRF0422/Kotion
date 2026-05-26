package com.knowledge.system.domain.permission;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName("knowledge_global_role")
public class GlobalRole extends TenantItemImpl {

	@TableId
	private Long id;
	private String roleName;
	private String alias;
	private Boolean admin;
	private Boolean isDefault;
	private String scope;
	private Long parentId;
}
