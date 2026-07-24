package com.knowledge.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.application.AdminApplication;
import com.knowledge.system.converter.UserConverter;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.dto.RegisterDTO;
import com.knowledge.system.dto.QueryUserDTO;
import com.knowledge.system.vo.UserVO;

import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import javax.validation.Valid;

@RestController
@RequestMapping("/user")
public class UserController {

	@Autowired
	private IUserService userService;
	@Autowired
	private AdminApplication adminApplication;

	/**
	 * 查询单条
	 */
	@ApiOperationSupport(order = 1)
	@ApiOperation(value = "查看详情", notes = "传入id")
	@GetMapping("/detail")
	public R<UserVO> detail(User user) {
		User detail = userService.getOne(Condition.getQueryWrapper(user));
		return R.data(UserConverter.INSTANCE.convert(detail));
	}

	/**
	 * 用户分页列表
	 */
	@ApiOperationSupport(order = 2)
	@ApiOperation(value = "用户列表", notes = "传入QueryUserDTO")
	@GetMapping("/list")
	public R<IPage<UserVO>> list(QueryUserDTO dto) {
		return R.data(UserConverter.INSTANCE.convert(userService.userList(dto)));
	}

	/**
	 * 查询单条
	 */
	@ApiOperationSupport(order = 3)
	@ApiOperation(value = "查看详情", notes = "传入id")
	@GetMapping("/info")
	public R<UserVO> info() {
		User detail = userService.getById(SecurityContextUtil.getUserId());
		return R.data(UserConverter.INSTANCE.convert(detail));
	}

	/**
	 * 新增或修改
	 */
	@PostMapping("/submit")
	@ApiOperationSupport(order = 4)
	@ApiOperation(value = "新增或修改", notes = "传入User")
	public R submit(@Valid @RequestBody User user) {
		return R.status(userService.submit(user));
	}

	/**
	 * 修改
	 */
	@PostMapping("/update")
	@ApiOperationSupport(order = 5)
	@ApiOperation(value = "修改", notes = "传入User")
	public R update(@Valid @RequestBody User user) {
		return R.status(userService.updateById(user));
	}

	/**
	 * 删除
	 */
	@PostMapping("/remove")
	@ApiOperationSupport(order = 6)
	@ApiOperation(value = "删除", notes = "传入地基和")
	public R remove(@RequestParam String ids) {
		return R.status(userService.removeBatchByIds(Func.toLongList(ids)));
	}

	/**
	 * 设置菜单权限
	 *
	 * @param userIds
	 * @param roleIds
	 * @return
	 */
	@PostMapping("/grant")
	@ApiOperationSupport(order = 7)
	@ApiOperation(value = "权限设置", notes = "传入roleId集合以及menuId集合")
	public R grant(@ApiParam(value = "userId集合", required = true) @RequestParam String userIds,
			@ApiParam(value = "roleId集合", required = true) @RequestParam String roleIds) {
		boolean temp = userService.grant(userIds, roleIds);
		return R.status(temp);
	}

	@PostMapping("/reset-password")
	@ApiOperationSupport(order = 8)
	@ApiOperation(value = "初始化密码", notes = "传入userId集合")
	public R resetPassword(@ApiParam(value = "userId集合", required = true) @RequestParam String userIds) {
		boolean temp = userService.resetPassword(userIds);
		return R.status(temp);
	}

	/**
	 * 修改密码
	 *
	 * @param oldPassword
	 * @param newPassword
	 * @param newPassword1
	 * @return
	 */
	@PostMapping("/update-password")
	@ApiOperationSupport(order = 9)
	@ApiOperation(value = "修改密码", notes = "传入密码")
	public R updatePassword(KnowledgeUser user,
			@ApiParam(value = "旧密码", required = true) @RequestParam String oldPassword,
			@ApiParam(value = "新密码", required = true) @RequestParam String newPassword,
			@ApiParam(value = "新密码", required = true) @RequestParam String newPassword1) {
		boolean temp = userService.updatePassword(user.getUserId(), oldPassword, newPassword, newPassword1);
		return R.status(temp);
	}

	@PostMapping("/register")
	public R<?> register(@RequestBody RegisterDTO dto) {
		adminApplication.register(dto);
		return R.success();
	}

	// /**
	// * Search users by keyword
	// */
	// @GetMapping("/search")
	// @ApiOperationSupport(order = 10)
	// @ApiOperation(value = "搜索用户", notes = "根据关键词搜索用户")
	// public R<?> searchUsers(@RequestParam("keyword") String keyword,
	// @RequestParam(value = "pageSize", required = false, defaultValue = "10")
	// Integer pageSize) {
	// QueryUserDTO queryUserDTO = new QueryUserDTO();
	// queryUserDTO.setSize(pageSize);
	// queryUserDTO.setSearchValue(keyword);
	// return
	// R.data(UserConverter.INSTANCE.convert(userService.userList(queryUserDTO)));
	// }

}
