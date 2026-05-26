package com.knowledge.system.application;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Ping++ 支付配置
 *
 * @author Qwen
 */
@Data
@Component
@ConfigurationProperties(prefix = "pingxx")
public class PingxxProperties {

    /**
     * API Key
     */
    private String apiKey;

    /**
     * App ID
     */
    private String appId;

    /**
     * 私钥路径
     */
    private String privateKeyPath;

    /**
     * 公钥路径
     */
    private String publicKeyPath;

    /**
     * 回调通知地址
     */
    private String notifyUrl;

    /**
     * 是否为测试环境
     */
    private Boolean testMode = true;
}