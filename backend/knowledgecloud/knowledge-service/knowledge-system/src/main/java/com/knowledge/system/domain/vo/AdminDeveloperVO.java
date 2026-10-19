package com.knowledge.system.domain.vo;

import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;

import io.swagger.annotations.ApiModel;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 审核后台看到的开发者认证档案：额外带上完整证件号与内部审核备注。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@ApiModel(value = "AdminDeveloperVO对象", description = "开发者认证审核档案")
public class AdminDeveloperVO extends DeveloperVO {

    private static final long serialVersionUID = 1L;

    /** 完整证件号，仅审核后台可见。 */
    private String idNumber;

    private String reviewComment;

    @JsonSerialize(using = ToStringSerializer.class)
    private Long reviewerId;
}
