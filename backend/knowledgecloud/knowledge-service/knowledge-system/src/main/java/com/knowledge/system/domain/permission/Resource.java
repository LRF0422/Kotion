package com.knowledge.system.domain.permission;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.TenantItemImpl;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
@TableName(value = "knowledge_resource", autoResultMap = true)
public class Resource extends TenantItemImpl {
	@TableId
	private Long id;
	private Long resourceId;
	private String name;
	private String alias;
	private String content;
	private String icon;
	private ResourceCategory category;
	@TableField(typeHandler = JacksonTypeHandler.class)
	private List<String> allowActions;
	private Long ownerId;

}
