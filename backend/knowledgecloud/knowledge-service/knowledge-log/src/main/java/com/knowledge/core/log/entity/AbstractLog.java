package com.knowledge.core.log.entity;

import java.io.Serializable;
import java.time.LocalDateTime;

import com.baomidou.mybatisplus.annotation.TableId;
import lombok.Data;

@Data
public abstract class AbstractLog implements Serializable {

    /**
     * 主键id
     */
    @TableId
    protected Long id;

    /**
     * 服务ID
     */
    protected String serviceId;
    /**
     * 服务器 ip
     */
    protected String serverIp;
    /**
     * 服务器名
     */
    protected String serverHost;
    /**
     * 环境
     */
    protected String env;
    /**
     * 操作IP地址
     */
    protected String remoteIp;
    /**
     * 用户代理
     */
    protected String userAgent;
    /**
     * 请求URI
     */
    protected String requestUri;
    /**
     * 操作方式
     */
    protected String method;
    /**
     * 方法类
     */
    protected String methodClass;
    /**
     * 方法名
     */
    protected String methodName;
    /**
     * 操作提交的数据
     */
    protected String params;
    /**
     * 执行时间
     */
    protected String time;

    protected LocalDateTime createTime;

    protected Long createBy;

}
