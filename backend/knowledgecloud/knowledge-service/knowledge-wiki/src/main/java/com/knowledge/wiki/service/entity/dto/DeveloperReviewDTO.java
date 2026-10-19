package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.Size;

import lombok.Data;

/**
 * 审核开发者认证：通过 / 驳回 / 撤销。
 *
 * <p>通过时 {@code comment} 可选；驳回与撤销必须填写 {@code reason}（应用层校验）。
 */
@Data
public class DeveloperReviewDTO implements Serializable {

    /** 驳回 / 撤销原因，会原样展示给开发者。 */
    @Size(max = 500, message = "原因长度不能超过500")
    private String reason;

    /** 内部审核备注（仅后台可见）。 */
    @Size(max = 500, message = "审核备注长度不能超过500")
    private String comment;
}
