package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 按天统计视图对象
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "DailyCountVO对象", description = "按天统计")
public class DailyCountVO implements Serializable {

	private static final long serialVersionUID = 1L;

	/**
	 * 日期（yyyy-MM-dd）
	 */
	@ApiModelProperty(value = "日期")
	private String date;

	/**
	 * 统计值
	 */
	@ApiModelProperty(value = "统计值")
	private Long value;
}
