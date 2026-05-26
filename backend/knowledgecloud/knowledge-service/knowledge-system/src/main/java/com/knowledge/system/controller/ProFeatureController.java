package com.knowledge.system.controller;

import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.permission.core.annotation.RequireProMembership;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Pro功能示例控制器
 * 展示如何使用Pro权限注解保护功能
 *
 * @author Qwen
 */
@Slf4j
@RestController
@RequestMapping("/pro-feature")
@RequiredArgsConstructor
@Api(tags = "Pro功能示例")
@RequireProMembership(message = "访问此功能需要Pro会员权限")
public class ProFeatureController {

    /**
     * Pro专属功能示例
     */
    @ApiOperationSupport(order = 1)
    @ApiOperation(value = "Pro专属功能", notes = "只有Pro会员可以访问此功能")
    @GetMapping("/exclusive")
    public R<String> proExclusiveFeature() {
        Long userId = SecurityContextUtil.getUserId();
        log.info("用户 {} 访问Pro专属功能", userId);
        return R.data("欢迎使用Pro专属功能！");
    }

    /**
     * 高级AI问答功能
     */
    @ApiOperationSupport(order = 2)
    @ApiOperation(value = "高级AI问答", notes = "Pro会员享受无限制AI问答")
    @GetMapping("/ai-chat")
    @RequireProMembership(message = "AI问答功能需要Pro会员权限")
    public R<String> advancedAIChat() {
        Long userId = SecurityContextUtil.getUserId();
        log.info("用户 {} 使用高级AI问答", userId);
        return R.data("Pro会员AI问答服务已启动");
    }

    /**
     * 团队协作功能
     */
    @ApiOperationSupport(order = 3)
    @ApiOperation(value = "团队协作", notes = "Pro会员专属团队协作功能")
    @GetMapping("/team-collaboration")
    public R<String> teamCollaboration() {
        Long userId = SecurityContextUtil.getUserId();
        log.info("用户 {} 使用团队协作功能", userId);
        return R.data("团队协作功能已开启");
    }
}