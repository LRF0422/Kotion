package com.knowledge.system.exception;

import com.knowledge.core.tool.exception.BusinessExceptionAssert;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum SystemException implements BusinessExceptionAssert {

    ORG_EXISTS(1000, "该机构已存在"),

    // Developer verification related (1200-1299)
    DEVELOPER_NOT_FOUND(1201, "开发者认证记录不存在"),
    DEVELOPER_APPLICATION_PENDING(1202, "开发者认证正在审核中，请耐心等待"),
    DEVELOPER_ALREADY_VERIFIED(1203, "你已完成开发者认证"),
    DEVELOPER_INVALID_STATE(1204, "开发者认证当前状态不允许此操作"),
    DEVELOPER_REASON_REQUIRED(1205, "驳回或撤销开发者认证必须填写原因"),
    DEVELOPER_FORBIDDEN(1206, "无权访问开发者认证");
      /**
     * 返回码
     */
    private final int code;
    /**
     * 返回消息
     */
    private final String message;
    
}
