package com.knowledge.system.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import com.knowledge.core.common.base.BaseEntity;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 落地页流量过滤规则实体
 */
@Data
@TableName("landing_filter_rule")
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "LandingFilterRule对象", description = "落地页流量过滤规则（内网 IP / 机器人 / 测试设备）")
public class LandingFilterRule extends BaseEntity {

	private static final long serialVersionUID = 1L;

	/**
	 * 主键
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.AUTO)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 站点标识
	 */
	@ApiModelProperty(value = "站点标识")
	private String siteId;

	/**
	 * 规则名称
	 */
	@ApiModelProperty(value = "规则名称")
	private String ruleName;

	/**
	 * 规则类型
	 */
	@ApiModelProperty(value = "规则类型：IP | IP_PREFIX | UA | VISITOR | PATH | EMAIL_DOMAIN")
	private String ruleType;

	/**
	 * 匹配表达式
	 */
	@ApiModelProperty(value = "规则类型对应的匹配表达式")
	private String pattern;

	/**
	 * 处理动作
	 */
	@ApiModelProperty(value = "处理动作：EXCLUDE | INCLUDE")
	private String action;

	/**
	 * 是否启用
	 */
	@ApiModelProperty(value = "是否启用")
	private Boolean enabled;

	/**
	 * 备注
	 */
	@ApiModelProperty(value = "备注")
	private String remark;
}
