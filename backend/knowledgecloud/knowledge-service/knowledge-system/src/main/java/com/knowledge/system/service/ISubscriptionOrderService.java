package com.knowledge.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.SubscriptionOrder;
import com.knowledge.system.domain.enums.PaymentMethodEnum;
import com.knowledge.system.domain.enums.SubscriptionTypeEnum;
import com.knowledge.system.domain.vo.SubscriptionOrderVO;

import java.util.List;

/**
 * 订阅订单服务接口
 *
 * @author Qwen
 */
public interface ISubscriptionOrderService extends IService<SubscriptionOrder> {

    /**
     * 创建订阅订单
     *
     * @param userId           用户ID
     * @param levelId          会员等级ID
     * @param subscriptionType 订阅类型
     * @param paymentMethod    支付方式
     * @return 订单信息
     */
    SubscriptionOrderVO createOrder(Long userId, Long levelId,
            SubscriptionTypeEnum subscriptionType,
            PaymentMethodEnum paymentMethod);

    /**
     * 获取用户订单列表
     *
     * @param userId 用户ID
     * @return 订单列表
     */
    List<SubscriptionOrderVO> getUserOrders(Long userId);

    /**
     * 取消订单
     *
     * @param orderId 订单ID
     * @param userId  用户ID
     */
    void cancelOrder(Long orderId, Long userId);

    /**
     * 处理支付成功回调
     *
     * @param orderNo 订单号
     * @param tradeNo 交易号
     */
    void handlePaymentSuccess(String orderNo, String tradeNo);
}