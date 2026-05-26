package com.knowledge.core.log.entity;

import com.baomidou.mybatisplus.annotation.TableName;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("knowledge_log_api")
public class LogApiDO extends AbstractLog {
    /**
     * 日志类型
     */
    private String type;
    /**
     * 日志标题
     */
    private String title;
}
