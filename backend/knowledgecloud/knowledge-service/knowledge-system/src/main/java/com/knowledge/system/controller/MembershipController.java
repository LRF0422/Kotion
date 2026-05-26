package com.knowledge.system.controller;

import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.domain.enums.PaymentMethodEnum;
import com.knowledge.system.domain.enums.SubscriptionTypeEnum;
import com.knowledge.system.domain.vo.MembershipLevelVO;
import com.knowledge.system.domain.vo.SubscriptionOrderVO;
import com.knowledge.system.domain.vo.UserMembershipVO;
import com.knowledge.system.service.IMembershipLevelService;
import com.knowledge.system.service.ISubscriptionOrderService;
import com.knowledge.system.service.IUserMembershipService;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.validation.constraints.NotNull;
import java.util.List;

/**
 * 会员管理控制器
 *
 * @author Qwen
 */
@Slf4j
@RestController
@RequestMapping("/membership")
@RequiredArgsConstructor
@Api(tags = "会员管理")
public class MembershipController {

    private final IMembershipLevelService membershipLevelService;
    private final IUserMembershipService userMembershipService;
    private final ISubscriptionOrderService subscriptionOrderService;

    /**
     * 获取所有会员等级
     */
    @ApiOperationSupport(order = 1)
    @ApiOperation(value = "获取会员等级列表", notes = "获取所有启用的会员等级")
    @GetMapping("/levels")
    public R<List<MembershipLevelVO>> getMembershipLevels() {
        List<MembershipLevelVO> levels = membershipLevelService.getAllEnabledLevels();
        return R.data(levels);
    }

    /**
     * 获取当前用户会员信息
     */
    @ApiOperationSupport(order = 2)
    @ApiOperation(value = "获取用户会员信息", notes = "获取当前登录用户的会员信息")
    @GetMapping("/info")
    public R<UserMembershipVO> getUserMembershipInfo() {
        Long userId = SecurityContextUtil.getUserId();
        UserMembershipVO membership = userMembershipService.getUserMembership(userId);
        return R.data(membership);
    }

    /**
     * 检查用户是否有Pro权限
     */
    @ApiOperationSupport(order = 3)
    @ApiOperation(value = "检查Pro权限", notes = "检查当前用户是否有Pro会员权限")
    @GetMapping("/check-pro")
    public R<Boolean> checkProPermission() {
        Long userId = SecurityContextUtil.getUserId();
        boolean hasPro = userMembershipService.hasProMembership(userId);
        return R.data(hasPro);
    }

    /**
     * 创建订阅订单
     */
    @ApiOperationSupport(order = 4)
    @ApiOperation(value = "创建订阅订单", notes = "创建会员订阅订单")
    @PostMapping("/subscribe")
    public R<SubscriptionOrderVO> createSubscriptionOrder(
            @RequestParam @NotNull(message = "会员等级ID不能为空") Long levelId,
            @RequestParam @NotNull(message = "订阅类型不能为空") SubscriptionTypeEnum subscriptionType,
            @RequestParam @NotNull(message = "支付方式不能为空") PaymentMethodEnum paymentMethod) {

        Long userId = SecurityContextUtil.getUserId();
        SubscriptionOrderVO order = subscriptionOrderService.createOrder(
                userId, levelId, subscriptionType, paymentMethod);
        return R.data(order);
    }

    /**
     * 获取用户订单列表
     */
    @ApiOperationSupport(order = 5)
    @ApiOperation(value = "获取订单列表", notes = "获取当前用户的订阅订单列表")
    @GetMapping("/orders")
    public R<List<SubscriptionOrderVO>> getUserOrders() {
        Long userId = SecurityContextUtil.getUserId();
        List<SubscriptionOrderVO> orders = subscriptionOrderService.getUserOrders(userId);
        return R.data(orders);
    }

    /**
     * 取消订单
     */
    @ApiOperationSupport(order = 6)
    @ApiOperation(value = "取消订单", notes = "取消未支付的订阅订单")
    @DeleteMapping("/orders/{orderId}")
    public R<Void> cancelOrder(@PathVariable @NotNull(message = "订单ID不能为空") Long orderId) {
        Long userId = SecurityContextUtil.getUserId();
        subscriptionOrderService.cancelOrder(orderId, userId);
        return R.success("订单取消成功");
    }
}