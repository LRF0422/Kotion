package com.knowledge.system.vo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

@Data
public class TenantVO implements Serializable {

	/**
	 * 主键id
	 */
	@ApiModelProperty(value = "主键")
	@TableId(value = "id", type = IdType.ASSIGN_ID)
	@JsonSerialize(using = ToStringSerializer.class)
	private Long id;

	/**
	 * 租户ID
	 */
	@ApiModelProperty(value = "租户ID")
	private String tenantId;
	/**
	 * 租户名称
	 */
	@ApiModelProperty(value = "租户名称")
	private String tenantName;
	/**
	 * 域名地址
	 */
	@ApiModelProperty(value = "域名地址")
	private String domain;
	/**
	 * 联系人
	 */
	@ApiModelProperty(value = "联系人")
	private String linkman;
	/**
	 * 联系电话
	 */
	@ApiModelProperty(value = "联系电话")
	private String contactNumber;
	/**
	 * 联系地址
	 */
	@ApiModelProperty(value = "联系地址")
	private String address;
}
