package com.knowledge.core.log.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import lombok.AllArgsConstructor;

import com.knowledge.core.log.entity.LogLoginDO;
import com.knowledge.core.log.service.ILogLoginService;
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.mp.support.Query;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.utils.Func;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 登录日志控制器
 *
 * @author jiang
 */
@RestController
@AllArgsConstructor
@RequestMapping("/login")
@PreAuthorize("(hasRole('platform.audit.read') or " + RoleConstant.HAS_ROLE_ADMIN
		+ ") and principal.clientId == 'kotion-platform-admin'")
public class LogLoginController {

	private ILogLoginService logLoginService;

	/**
	 * 查询多条(分页)，支持按账号/结果筛选
	 */
	@GetMapping("/list")
	public R<IPage<LogLoginDO>> list(@RequestParam(required = false) String account,
			@RequestParam(required = false) Integer success,
			@RequestParam(required = false) Long userId,
			Query query) {
		LambdaQueryWrapper<LogLoginDO> wrapper = Wrappers.<LogLoginDO>lambdaQuery()
				.like(Func.isNotBlank(account), LogLoginDO::getAccount, account)
				.eq(success != null, LogLoginDO::getSuccess, success)
				.eq(userId != null, LogLoginDO::getUserId, userId)
				.orderByDesc(LogLoginDO::getCreateTime);
		return R.data(logLoginService.page(Condition.getPage(query), wrapper));
	}

}
