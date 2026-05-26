package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.math.BigDecimal;
import java.util.Date;
import java.util.List;

/**
 * 会员等级VO
 *
 * @author Qwen
 */
@Data
@ApiModel(value = "MembershipLevelVO对象", description = "会员等级VO")
public class MembershipLevelVO {

    /**
     * 主键id
     */
    @ApiModelProperty(value = "主键")
    @JsonSerialize(using = ToStringSerializer.class)
    private Long id;

    /**
     * 等级编码
     */
    @ApiModelProperty(value = "等级编码")
    private String levelCode;

    /**
     * 等级名称
     */
    @ApiModelProperty(value = "等级名称")
    private String levelName;

    /**
     * 等级描述
     */
    @ApiModelProperty(value = "等级描述")
    private String levelDesc;

    /**
     * 月付价格
     */
    @ApiModelProperty(value = "月付价格")
    private BigDecimal priceMonthly;

    /**
     * 年付价格
     */
    @ApiModelProperty(value = "年付价格")
    private BigDecimal priceYearly;

    /**
     * 权益列表
     */
    @ApiModelProperty(value = "权益列表")
    private List<String> benefits;

    /**
     * 排序
     */
    @ApiModelProperty(value = "排序")
    private Integer sort;
}