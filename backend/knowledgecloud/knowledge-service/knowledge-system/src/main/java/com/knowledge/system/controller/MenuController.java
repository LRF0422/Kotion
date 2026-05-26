/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.system.controller;

import com.github.xiaoymin.knife4j.annotations.ApiOperationSupport;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import io.swagger.annotations.*;
import lombok.AllArgsConstructor;
import com.knowledge.core.mp.support.Condition;
import org.springframework.security.access.prepost.PreAuthorize;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.support.Kv;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.Menu;
import com.knowledge.system.service.IMenuService;
import com.knowledge.system.vo.CheckedTreeVO;
import com.knowledge.system.vo.GrantTreeVO;
import com.knowledge.system.vo.MenuVO;
import com.knowledge.system.wrapper.MenuWrapper;
import org.springframework.web.bind.annotation.*;
import springfox.documentation.annotations.ApiIgnore;

import javax.validation.Valid;
import java.util.List;
import java.util.Map;

/**
 * 控制器
 *
 * @author Chill
 */
@RestController
@AllArgsConstructor
@RequestMapping("/menu")
@Api(value = "菜单", tags = "菜单")
public class MenuController extends KnowledgeController {

	private IMenuService menuService;

	/**
	 * 详情
	 */
	@GetMapping("/detail")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 1)
	@ApiOperation(value = "详情", notes = "传入menu")
	public R<MenuVO> detail(Menu menu) {
		Menu detail = menuService.getOne(Condition.getQueryWrapper(menu));
		return R.data(MenuWrapper.build().entityVO(detail));
	}

	/**
	 * 列表
	 */
	@GetMapping("/list")
	@ApiImplicitParams({
			@ApiImplicitParam(name = "code", value = "菜单编号", paramType = "query", dataType = "string"),
			@ApiImplicitParam(name = "name", value = "菜单名称", paramType = "query", dataType = "string")
	})
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 2)
	@ApiOperation(value = "列表", notes = "传入menu")
	public R<List<MenuVO>> list(@ApiIgnore @RequestParam Map<String, Object> menu) {
		List<Menu> list = menuService
				.list(Condition.getQueryWrapper(menu, Menu.class).lambda().orderByAsc(Menu::getSort));
		return R.data(MenuWrapper.build().listNodeVO(list));
	}

	/**
	 * 菜单列表
	 */
	@GetMapping("/menu-list")
	@ApiImplicitParams({
			@ApiImplicitParam(name = "code", value = "菜单编号", paramType = "query", dataType = "string"),
			@ApiImplicitParam(name = "name", value = "菜单名称", paramType = "query", dataType = "string")
	})
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 3)
	@ApiOperation(value = "菜单列表", notes = "传入menu")
	public R<List<MenuVO>> menuList(@ApiIgnore @RequestParam Map<String, Object> menu) {
		List<Menu> list = menuService.list(Condition.getQueryWrapper(menu, Menu.class).lambda().eq(Menu::getCategory, 1)
				.orderByAsc(Menu::getSort));
		return R.data(MenuWrapper.build().listNodeVO(list));
	}

	/**
	 * 懒加载菜单列表
	 */
	@GetMapping("/lazy-menu-list")
	@ApiImplicitParams({
			@ApiImplicitParam(name = "code", value = "菜单编号", paramType = "query", dataType = "string"),
			@ApiImplicitParam(name = "name", value = "菜单名称", paramType = "query", dataType = "string")
	})
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 4)
	@ApiOperation(value = "懒加载菜单列表", notes = "传入menu")
	public R<List<MenuVO>> lazyMenuList(Long parentId, @ApiIgnore @RequestParam Map<String, Object> menu) {
		List<MenuVO> list = menuService.lazyMenuList(parentId, menu);
		return R.data(MenuWrapper.build().listNodeLazyVO(list));
	}

	/**
	 * 新增或修改
	 */
	@PostMapping("/submit")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 5)
	@ApiOperation(value = "新增或修改", notes = "传入menu")
	public R submit(@Valid @RequestBody Menu menu) {
		return R.status(menuService.saveOrUpdate(menu));
	}

	/**
	 * 删除
	 */
	@PostMapping("/remove")
	@PreAuthorize(RoleConstant.HAS_ROLE_ADMIN)
	@ApiOperationSupport(order = 6)
	@ApiOperation(value = "删除", notes = "传入ids")
	public R remove(@ApiParam(value = "主键集合", required = true) @RequestParam String ids) {
		return R.status(menuService.removeByIds(Func.toLongList(ids)));
	}

	/**
	 * 前端菜单数据
	 */
	@GetMapping("/routes")
	@ApiOperationSupport(order = 7)
	@ApiOperation(value = "前端菜单数据", notes = "前端菜单数据")
	public R<List<MenuVO>> routes() {
		KnowledgeUser user = SecurityContextUtil.getUser();
		List<MenuVO> list = menuService.routes((user == null || user.getUserId() == 0L) ? null : user.getRoleId());
		return R.data(list);
	}

	/**
	 * 前端按钮数据
	 */
	@GetMapping("/buttons")
	@ApiOperationSupport(order = 8)
	@ApiOperation(value = "前端按钮数据", notes = "前端按钮数据")
	public R<List<MenuVO>> buttons(KnowledgeUser user) {
		List<MenuVO> list = menuService.buttons(user.getRoleId());
		return R.data(list);
	}

	/**
	 * 获取菜单树形结构
	 */
	@GetMapping("/tree")
	@ApiOperationSupport(order = 9)
	@ApiOperation(value = "树形结构", notes = "树形结构")
	public R<List<MenuVO>> tree() {
		List<MenuVO> tree = menuService.tree();
		return R.data(tree);
	}

	/**
	 * 获取权限分配树形结构
	 */
	@GetMapping("/grant-tree")
	@ApiOperationSupport(order = 10)
	@ApiOperation(value = "权限分配树形结构", notes = "权限分配树形结构")
	public R<GrantTreeVO> grantTree(KnowledgeUser user) {
		GrantTreeVO vo = new GrantTreeVO();
		vo.setMenu(menuService.grantTree(user));
		vo.setDataScope(menuService.grantDataScopeTree(user));
		return R.data(vo);
	}

	/**
	 * 获取权限分配树形结构
	 */
	@GetMapping("/role-tree-keys")
	@ApiOperationSupport(order = 11)
	@ApiOperation(value = "角色所分配的树", notes = "角色所分配的树")
	public R<CheckedTreeVO> roleTreeKeys(String roleIds) {
		CheckedTreeVO vo = new CheckedTreeVO();
		vo.setMenu(menuService.roleTreeKeys(roleIds));
		vo.setDataScope(menuService.dataScopeTreeKeys(roleIds));
		return R.data(vo);
	}

	/**
	 * 获取配置的角色权限
	 */
	@GetMapping("auth-routes")
	@ApiOperationSupport(order = 12)
	@ApiOperation(value = "菜单的角色权限")
	public R<List<Kv>> authRoutes(KnowledgeUser user) {
		if (Func.isEmpty(user) || user.getUserId() == 0L) {
			return null;
		}
		return R.data(menuService.authRoutes(user));
	}

	// @GetMapping("app-menus")
	// public R<List<MenuVO>> appMenus() {
	// return R.data(menuService.getMenuTreeByClientId());
	// }

}
