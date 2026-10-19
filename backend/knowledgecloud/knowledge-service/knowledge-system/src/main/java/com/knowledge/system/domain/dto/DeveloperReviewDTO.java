package com.knowledge.system.domain.dto;

import java.io.Serializable;

import javax.validation.constraints.Size;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

/**
 * 审核开发者认证：通过 / 驳回 / 撤销。
 *
 * <p>通过时 {@code comment} 可选；驳回与撤销必须填写 {@code reason}（应用层校验）。
 */
@Data
@ApiModel(value = "DeveloperReviewDTO对象", description = "开发者认证审核")
public class DeveloperReviewDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 驳回 / 撤销原因，会原样展示给开发者。 */
    @ApiModelProperty(value = "驳回/撤销原因")
    @Size(max = 500, message = "原因长度不能超过500")
    private String reason;

    /** 内部审核备注（仅后台可见）。 */
    @ApiModelProperty(value = "内部审核备注")
    @Size(max = 500, message = "审核备注长度不能超过500")
    private String comment;
}
