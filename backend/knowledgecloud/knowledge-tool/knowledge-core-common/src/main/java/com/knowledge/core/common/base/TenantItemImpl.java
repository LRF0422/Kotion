package com.knowledge.core.common.base;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
public abstract class TenantItemImpl extends BaseEntity implements TenantItem {

	@TableField(fill = FieldFill.INSERT)
	private String tenantId;
}
