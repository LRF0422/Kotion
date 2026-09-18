package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;

/**
 * 权益定义视图。
 *
 * @author Kotion
 */
@Data
public class EntitlementDefinitionVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "权益编码")
	private String code;

	@ApiModelProperty(value = "权益名称")
	private String name;

	/** FEATURE / QUOTA。 */
	private String category;

	/** BOOLEAN / NUMBER。 */
	private String valueType;

	@ApiModelProperty(value = "数值单位")
	private String unit;

	@ApiModelProperty(value = "说明")
	private String description;

	private Integer sort;
}
