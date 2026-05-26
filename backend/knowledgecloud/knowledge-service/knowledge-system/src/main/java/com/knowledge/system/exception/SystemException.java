package com.knowledge.system.exception;

import com.knowledge.core.tool.exception.BusinessExceptionAssert;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum SystemException implements BusinessExceptionAssert {

    ORG_EXISTS(1000, "该机构已存在");
      /**
     * 返回码
     */
    private final int code;
    /**
     * 返回消息
     */
    private final String message;
    
}
