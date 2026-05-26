package com.knowledge.core.log.entity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_log_usual")
public class LogUsualDO extends AbstractLog {
    /**
     * 日志级别
     */
    private String logLevel;
    /**
     * 日志业务id
     */
    private String logId;
    /**
     * 日志数据
     */
    private String logData;
}
