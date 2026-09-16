package com.knowledge.system.domain.vo;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 落地页会话统计
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ApiModel(value = "LandingSessionStatsVO对象", description = "落地页会话统计")
public class LandingSessionStatsVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@ApiModelProperty(value = "bounces")
	private Long bounces;

	@ApiModelProperty(value = "avgDurationMs")
	private Double avgDurationMs;
}
