package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantItemImpl;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName("knowledge_user_group")
public class UserGroup extends TenantItemImpl {

	@TableId(type = IdType.ASSIGN_ID)
	private Long id;
	private String name;
	private String description;
	private Long objectId;
	private Boolean isDefault;
	private Boolean isAdmin;

}
