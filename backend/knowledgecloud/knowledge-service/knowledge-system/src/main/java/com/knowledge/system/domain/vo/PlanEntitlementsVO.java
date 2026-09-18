package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 某用户当前生效的权益快照。
 *
 * @author Kotion
 */
@Data
public class PlanEntitlementsVO implements Serializable {

	private static final long serialVersionUID = 1L;

	@JsonSerialize(using = ToStringSerializer.class)
	private Long userId;

	private String planCode;

	private String planName;

	private Integer tier;

	private Map<String, Boolean> features = new LinkedHashMap<>();

	private Map<String, Long> quotas = new LinkedHashMap<>();

	@ApiModelProperty(value = "解析时间戳（毫秒），便于前端判断缓存新鲜度")
	private Long resolvedAt;
}
