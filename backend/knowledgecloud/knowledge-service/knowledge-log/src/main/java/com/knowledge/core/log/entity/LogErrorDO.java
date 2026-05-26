package com.knowledge.core.log.entity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_log_error")
public class LogErrorDO extends AbstractLog {
    /**
     * 堆栈信息
     */
    private String stackTrace;
    /**
     * 异常名
     */
    private String exceptionName;
    /**
     * 异常消息
     */
    private String message;

    /**
     * 文件名
     */
    private String fileName;

    /**
     * 代码行数
     */
    private Integer lineNumber;
}
