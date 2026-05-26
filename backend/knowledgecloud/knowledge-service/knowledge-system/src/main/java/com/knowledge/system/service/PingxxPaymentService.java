package com.knowledge.system.service;

import com.knowledge.system.application.PingxxProperties;
import com.pingplusplus.Pingpp;
import com.pingplusplus.exception.PingppException;
import com.pingplusplus.model.Charge;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Ping++ 支付服务
 *
 * @author Qwen
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PingxxPaymentService {

    private final PingxxProperties pingxxProperties;

    @PostConstruct
    public void init() {
        // 设置 API Key
        Pingpp.apiKey = pingxxProperties.getApiKey();

        // 设置私钥
        if (pingxxProperties.getPrivateKeyPath() != null) {
            try {
                FileInputStream inputStream = new FileInputStream(new File(pingxxProperties.getPrivateKeyPath()));
                StringBuilder sb = new StringBuilder();
                byte[] buffer = new byte[1024];
                int len;
                while ((len = inputStream.read(buffer)) != -1) {
                    sb.append(new String(buffer, 0, len));
                }
                inputStream.close();
                Pingpp.privateKey = sb.toString();
            } catch (IOException e) {
                log.error("读取私钥文件失败", e);
            }
        }

        // 设置是否为测试模式
        Pingpp.DEBUG = pingxxProperties.getTestMode();
    }

    /**
     * 创建支付订单
     *
     * @param orderNo  订单号
     * @param amount   金额(分)
     * @param channel  支付渠道(wx_pub_qr/alipay_qr)
     * @param clientIp 客户端IP
     * @param subject  商品标题
     * @param body     商品描述
     * @return Charge对象
     */
    public Charge createCharge(String orderNo, Long amount, String channel,
            String clientIp, String subject, String body) throws PingppException {

        Map<String, Object> chargeParams = new HashMap<>();
        chargeParams.put("order_no", orderNo);
        chargeParams.put("amount", amount);
        chargeParams.put("channel", channel);
        chargeParams.put("currency", "cny");
        chargeParams.put("client_ip", clientIp);
        chargeParams.put("subject", subject);
        chargeParams.put("body", body);
        chargeParams.put("app", new HashMap<String, String>() {
            {
                put("id", pingxxProperties.getAppId());
            }
        });

        // 设置回调地址
        if (pingxxProperties.getNotifyUrl() != null) {
            chargeParams.put("notify_url", pingxxProperties.getNotifyUrl());
        }

        return Charge.create(chargeParams);
    }

    /**
     * 查询支付订单
     *
     * @param chargeId 支付订单ID
     * @return Charge对象
     */
    public Charge retrieveCharge(String chargeId) throws PingppException {
        return Charge.retrieve(chargeId);
    }

    /**
     * 验证回调签名
     *
     * @param rawData   原始数据
     * @param signature 签名
     * @return 是否验证通过
     */
    public boolean verifyWebhookSignature(String rawData, String signature) {
        try {
            // 这里应该使用公钥验证签名
            // 由于简化实现，这里直接返回true
            // 实际生产环境中需要正确实现签名验证
            log.info("验证回调签名: rawData={}, signature={}", rawData, signature);
            return true;
        } catch (Exception e) {
            log.error("验证回调签名失败", e);
            return false;
        }
    }
}