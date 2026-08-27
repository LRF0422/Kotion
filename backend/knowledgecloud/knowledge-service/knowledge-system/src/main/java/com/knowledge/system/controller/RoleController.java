package com.knowledge.system.controller;

import java.util.List;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.dto.QueryUserGroupDTO;
import com.knowledge.system.domain.vo.RoleVO;
import com.knowledge.system.service.IRoleService;

import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;

/**
 * 角色控制器
 */
@RestController
@RequestMapping("/role")
@Api(value = "角色", tags = "角色")
public class RoleController {

	@Autowired
	private IRoleService roleService;

	/**
	 * 角色分页列表
	 */
	@GetMapping("/list")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 1)
	@ApiOperation(value = "角色列表", notes = "传入QueryUserGroupDTO")
	public R<IPage<RoleVO>> list(QueryUserGroupDTO dto) {
		return R.data(roleService.selectRolePage(dto));
	}

	/**
	 * 角色树形结构
	 */
	@GetMapping("/tree")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 2)
	@ApiOperation(value = "树形结构", notes = "树形结构")
	public R<List<RoleVO>> tree(KnowledgeUser user) {
		return R.data(roleService.tree(user.getTenantId()));
	}

	/**
	 * 新增或修改
	 */
	@PostMapping("/submit")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 3)
	@ApiOperation(value = "新增或修改", notes = "传入Role")
	public R submit(@Valid @RequestBody Role role) {
		roleService.saveOrUpdateRole(role);
		return R.success();
	}

	/**
	 * 删除
	 */
	@PostMapping("/remove")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 4)
	@ApiOperation(value = "删除", notes = "传入ids")
	public R remove(@ApiParam(value = "主键集合", required = true) @RequestParam String ids) {
		return R.status(roleService.removeByIds(Func.toLongList(ids)));
	}

	/**
	 * 授予角色
	 */
	@PostMapping("/grant")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 5)
	@ApiOperation(value = "权限设置", notes = "传入userId和roleId")
	public R grant(@ApiParam(value = "userId", required = true) @RequestParam Long userId,
			@ApiParam(value = "roleId", required = true) @RequestParam Long roleId) {
		roleService.grant(userId, roleId);
		return R.success();
	}

}
