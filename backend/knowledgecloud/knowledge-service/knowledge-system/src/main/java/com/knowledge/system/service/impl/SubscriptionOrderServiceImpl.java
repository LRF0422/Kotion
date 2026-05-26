package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.MembershipLevel;
import com.knowledge.system.domain.PaymentRecord;
import com.knowledge.system.domain.SubscriptionOrder;
import com.knowledge.system.domain.UserMembership;
import com.knowledge.system.domain.enums.*;
import com.knowledge.system.domain.vo.SubscriptionOrderVO;
import com.knowledge.system.mapper.SubscriptionOrderMapper;
import com.knowledge.system.service.IMembershipLevelService;
import com.knowledge.system.service.IPaymentRecordService;
import com.knowledge.system.service.ISubscriptionOrderService;
import com.knowledge.system.service.IUserMembershipService;
import com.knowledge.system.service.PingxxPaymentService;
import com.pingplusplus.exception.PingppException;
import com.pingplusplus.model.Charge;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 订阅订单服务实现类
 *
 * @author Qwen
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SubscriptionOrderServiceImpl extends ServiceImpl<SubscriptionOrderMapper, SubscriptionOrder>
        implements ISubscriptionOrderService {

    private final IMembershipLevelService membershipLevelService;
    private final IUserMembershipService userMembershipService;
    private final IPaymentRecordService paymentRecordService;
    private final PingxxPaymentService pingxxPaymentService;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public SubscriptionOrderVO createOrder(Long userId, Long levelId,
            SubscriptionTypeEnum subscriptionType,
            PaymentMethodEnum paymentMethod) {

        // 获取会员等级信息
        MembershipLevel level = membershipLevelService.getById(levelId);
        if (level == null) {
            throw new RuntimeException("会员等级不存在");
        }

        // 计算金额
        BigDecimal amount = SubscriptionTypeEnum.YEARLY.equals(subscriptionType) ? level.getPriceYearly()
                : level.getPriceMonthly();

        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("该会员等级不支持付费订阅");
        }

        // 创建订单
        SubscriptionOrder order = new SubscriptionOrder();
        String orderNo = generateOrderNo();
        order.setOrderNo(orderNo);
        order.setUserId(userId);
        order.setLevelId(levelId);
        order.setLevelCode(level.getLevelCode());
        order.setSubscriptionType(subscriptionType.getCode());
        order.setAmount(amount);
        order.setStatus(OrderStatusEnum.PENDING.getCode());
        order.setPaymentMethod(paymentMethod.getCode());

        // 设置支付截止时间(30分钟)
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.MINUTE, 30);
        order.setPaymentDeadline(cal.getTime());

        this.save(order);

        // 调用Ping++创建支付订单
        try {
            String channel = paymentMethod.equals(PaymentMethodEnum.WECHAT_QR) ? "wx_pub_qr" : "alipay_qr";

            Charge charge = pingxxPaymentService.createCharge(
                    orderNo,
                    amount.multiply(new BigDecimal("100")).longValue(), // 转换为分
                    channel,
                    "127.0.0.1",
                    level.getLevelName() + "会员订阅",
                    subscriptionType.getDesc() + "订阅");

            // 保存二维码URL
            order.setQrCodeUrl(charge.getCredential().get(channel).toString());
            order.setTradeNo(charge.getId());
            this.updateById(order);

        } catch (PingppException e) {
            log.error("创建支付订单失败", e);
            throw new RuntimeException("创建支付订单失败: " + e.getMessage());
        }

        // 转换为VO
        SubscriptionOrderVO vo = new SubscriptionOrderVO();
        BeanUtils.copyProperties(order, vo);
        vo.setLevelName(level.getLevelName());
        return vo;
    }

    @Override
    public List<SubscriptionOrderVO> getUserOrders(Long userId) {
        LambdaQueryWrapper<SubscriptionOrder> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(SubscriptionOrder::getUserId, userId)
                .eq(SubscriptionOrder::getIsDeleted, 0)
                .orderByDesc(SubscriptionOrder::getCreateTime);

        List<SubscriptionOrder> orders = this.list(wrapper);

        return orders.stream().map(order -> {
            SubscriptionOrderVO vo = new SubscriptionOrderVO();
            BeanUtils.copyProperties(order, vo);

            // 获取等级名称
            MembershipLevel level = membershipLevelService.getById(order.getLevelId());
            if (level != null) {
                vo.setLevelName(level.getLevelName());
            }

            return vo;
        }).collect(Collectors.toList());
    }

    @Override
    public void cancelOrder(Long orderId, Long userId) {
        SubscriptionOrder order = this.getById(orderId);
        if (order == null || !order.getUserId().equals(userId)) {
            throw new RuntimeException("订单不存在或无权限操作");
        }

        if (!OrderStatusEnum.PENDING.getCode().equals(order.getStatus())) {
            throw new RuntimeException("只有待支付订单可以取消");
        }

        order.setStatus(OrderStatusEnum.CANCELLED.getCode());
        this.updateById(order);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void handlePaymentSuccess(String orderNo, String tradeNo) {
        // 查找订单
        LambdaQueryWrapper<SubscriptionOrder> wrapper = Wrappers.lambdaQuery();
        wrapper.eq(SubscriptionOrder::getOrderNo, orderNo)
                .eq(SubscriptionOrder::getIsDeleted, 0);

        SubscriptionOrder order = this.getOne(wrapper);
        if (order == null) {
            log.warn("订单不存在: {}", orderNo);
            return;
        }

        if (OrderStatusEnum.PAID.getCode().equals(order.getStatus())) {
            log.info("订单已处理: {}", orderNo);
            return;
        }

        // 更新订单状态
        order.setStatus(OrderStatusEnum.PAID.getCode());
        order.setPaidTime(new Date());
        order.setTradeNo(tradeNo);
        this.updateById(order);

        // 计算会员时长
        int months = SubscriptionTypeEnum.YEARLY.getCode().equals(order.getSubscriptionType()) ? 12 : 1;

        // 更新用户会员信息
        userMembershipService.updateUserMembership(order.getUserId(), order.getLevelId(), months);

        // 创建支付记录
        PaymentRecord paymentRecord = new PaymentRecord();
        paymentRecord.setTradeNo(tradeNo);
        paymentRecord.setOrderId(order.getId());
        paymentRecord.setOrderNo(orderNo);
        paymentRecord.setUserId(order.getUserId());
        paymentRecord.setAmount(order.getAmount());
        paymentRecord.setPaymentMethod(order.getPaymentMethod());
        paymentRecord.setStatus(PaymentStatusEnum.SUCCESS.getCode());
        paymentRecord.setPaidTime(new Date());

        paymentRecordService.save(paymentRecord);

        log.info("订单支付处理完成: {}", orderNo);
    }

    /**
     * 生成订单号
     */
    private String generateOrderNo() {
        return "ORD" + System.currentTimeMillis() + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}