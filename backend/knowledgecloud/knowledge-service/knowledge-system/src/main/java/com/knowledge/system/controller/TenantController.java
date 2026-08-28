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

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.boot.ctrl.KnowledgeController;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import com.knowledge.system.domain.dto.TenantDTO;
import io.swagger.annotations.*;
import lombok.AllArgsConstructor;
import com.knowledge.core.mp.support.Condition;
import com.knowledge.core.mp.support.Query;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.support.Kv;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.Tenant;
import com.knowledge.system.service.ITenantService;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/tenant")
@ApiIgnore
@Api(value = "租户管理", tags = "接口")
public class TenantController extends KnowledgeController {

	private static final String READ_ACCESS = "(hasRole('platform.settings.read') or "
			+ RoleConstant.HAS_ROLE_ADMIN + ") and principal.clientId == 'kotion-platform-admin'";
	private static final String MANAGE_ACCESS = "(hasRole('platform.settings.manage') or "
			+ RoleConstant.HAS_ROLE_ADMIN + ") and principal.clientId == 'kotion-platform-admin'";

	private ITenantService tenantService;

	/**
	 * 详情
	 */
	@GetMapping("/detail")
	@PreAuthorize(READ_ACCESS)
	@ApiOperation(value = "详情", notes = "传入tenant")
	public R<Tenant> detail(Tenant tenant) {
		Tenant detail = tenantService.getOne(Condition.getQueryWrapper(tenant));
		return R.data(detail);
	}

	/**
	 * 分页
	 */
	@GetMapping("/list")
	@PreAuthorize(READ_ACCESS)
	@ApiImplicitParams({
			@ApiImplicitParam(name = "tenantId", value = "参数名称", paramType = "query", dataType = "string"),
			@ApiImplicitParam(name = "tenantName", value = "角色别名", paramType = "query", dataType = "string"),
			@ApiImplicitParam(name = "contactNumber", value = "联系电话", paramType = "query", dataType = "string")
	})
	@ApiOperation(value = "分页", notes = "传入tenant")
	public R<IPage<Tenant>> list(@ApiIgnore @RequestParam Map<String, Object> tenant, Query query,
			KnowledgeUser knowledgeUser) {
		QueryWrapper<Tenant> queryWrapper = Condition.getQueryWrapper(tenant, Tenant.class);
		IPage<Tenant> pages = tenantService.page(Condition.getPage(query),
				(!knowledgeUser.getTenantId().equals(KnowledgeConstant.ADMIN_TENANT_ID))
						? queryWrapper.lambda().eq(Tenant::getTenantId, knowledgeUser.getTenantId())
						: queryWrapper);
		return R.data(pages);
	}

	/**
	 * 下拉数据源
	 */
	@GetMapping("/select")
	@PreAuthorize(READ_ACCESS)
	@ApiOperation(value = "下拉数据源", notes = "传入tenant")
	public R<List<Tenant>> select(Tenant tenant, KnowledgeUser knowledgeUser) {
		QueryWrapper<Tenant> queryWrapper = Condition.getQueryWrapper(tenant);
		List<Tenant> list = tenantService.list((!knowledgeUser.getTenantId().equals(KnowledgeConstant.ADMIN_TENANT_ID))
				? queryWrapper.lambda().eq(Tenant::getTenantId, knowledgeUser.getTenantId())
				: queryWrapper);
		return R.data(list);
	}

	/**
	 * 自定义分页
	 */
	@GetMapping("/page")
	@PreAuthorize(READ_ACCESS)
	@ApiOperation(value = "分页", notes = "传入tenant")
	public R<IPage<Tenant>> page(Tenant tenant, Query query) {
		IPage<Tenant> pages = tenantService.selectTenantPage(Condition.getPage(query), tenant);
		return R.data(pages);
	}

	/**
	 * 新增或修改
	 */
	@PostMapping("/submit")
	@PreAuthorize(MANAGE_ACCESS)
	@ApiOperation(value = "新增或修改", notes = "传入tenant")
	public R submit(@Valid @RequestBody Tenant tenant) {
		return R.status(tenantService.saveTenant(tenant));
	}

	/**
	 * 删除
	 */
	@PostMapping("/remove")
	@PreAuthorize(MANAGE_ACCESS)
	@ApiOperation(value = "逻辑删除", notes = "传入ids")
	public R remove(@ApiParam(value = "主键集合", required = true) @RequestParam String ids) {
		return R.status(tenantService.removeBatchByIds(Func.toLongList(ids)));
	}

	/**
	 * 根据域名查询信息
	 *
	 * @param domain 域名
	 */
	@GetMapping("/info")
	@ApiOperation(value = "配置信息", notes = "传入domain")
	public R<Kv> info(String domain) {
		Tenant tenant = tenantService.getOne(Wrappers.<Tenant>query().lambda().eq(Tenant::getDomain, domain));
		Kv kv = Kv.init();
		if (tenant != null) {
			kv.set("tenantId", tenant.getTenantId()).set("domain", tenant.getDomain());
		}
		return R.data(kv);
	}

}
