package com.knowledge.system.controller;

import com.knowledge.core.tool.api.R;
import com.knowledge.system.service.ISubscriptionOrderService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.io.BufferedReader;
import java.util.HashMap;
import java.util.Map;

/**
 * 支付回调控制器
 *
 * @author Qwen
 */
@Slf4j
@RestController
@RequestMapping("/payment")
@RequiredArgsConstructor
@Api(tags = "支付回调")
public class PaymentCallbackController {

    private final ISubscriptionOrderService subscriptionOrderService;

    /**
     * Ping++ 支付回调
     */
    @ApiOperation(value = "支付回调通知", notes = "接收Ping++支付回调通知")
    @PostMapping("/pingxx/callback")
    public R<String> pingxxCallback(HttpServletRequest request) {
        try {
            // 读取回调数据
            StringBuilder sb = new StringBuilder();
            BufferedReader reader = request.getReader();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            String rawData = sb.toString();

            log.info("收到Ping++回调: {}", rawData);

            // 解析回调数据
            // 这里简化处理，实际应该解析JSON数据
            // 从请求头获取签名
            String signature = request.getHeader("X-Pingplusplus-Signature");

            // 验证签名（简化处理）
            // 实际应该使用公钥验证签名

            // 处理支付成功逻辑
            // 这里假设回调数据包含order_no和id字段
            // 实际应该解析具体的JSON结构

            // subscriptionOrderService.handlePaymentSuccess(orderNo, tradeNo);

            return R.success("success");
        } catch (Exception e) {
            log.error("处理支付回调异常", e);
            return R.fail("处理失败");
        }
    }

    /**
     * 查询支付状态
     */
    @ApiOperation(value = "查询支付状态", notes = "查询订单支付状态")
    @GetMapping("/status/{orderNo}")
    public R<Map<String, Object>> queryPaymentStatus(@PathVariable String orderNo) {
        // 这里应该调用支付服务查询订单状态
        // 简化实现，返回模拟数据
        new Thread(() -> {
            // 模拟异步处理支付成功
            try {
                Thread.sleep(5000); // 5秒后模拟支付成功
                subscriptionOrderService.handlePaymentSuccess(orderNo, "test_trade_no_" + System.currentTimeMillis());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }).start();

        Map<String, Object> result = new HashMap<>();
        result.put("status", "processing");
        return R.data(result);
    }
}