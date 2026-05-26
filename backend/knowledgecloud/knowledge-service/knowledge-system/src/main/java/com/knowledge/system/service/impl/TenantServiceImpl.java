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
package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import lombok.AllArgsConstructor;
import com.knowledge.core.boot.tenant.TenantId;
import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.tool.utils.DigestUtil;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.Dept;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.Tenant;
import com.knowledge.system.mapper.DeptMapper;
import com.knowledge.system.mapper.RoleMapper;
import com.knowledge.system.mapper.TenantMapper;
import com.knowledge.system.service.IPostService;
import com.knowledge.system.service.ITenantService;
import com.knowledge.system.service.IUserService;
import com.knowledge.system.domain.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Date;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 服务实现类
 *
 * @author Chill
 */
@Service
@AllArgsConstructor
public class TenantServiceImpl extends BaseService<TenantMapper, Tenant> implements ITenantService {

	private final TenantId tenantId;
	private final RoleMapper roleMapper;
	private final DeptMapper deptMapper;
	private final IPostService postService;
	private final IUserService userService;

	@Override
	public IPage<Tenant> selectTenantPage(IPage<Tenant> page, Tenant tenant) {
		return page.setRecords(baseMapper.selectTenantPage(page, tenant));
	}

	@Override
	public Tenant getByTenantId(String tenantId) {
		return getOne(Wrappers.<Tenant>query().lambda().eq(Tenant::getTenantId, tenantId));
	}

	@Override
	@Transactional(rollbackFor = Exception.class)
	public boolean saveTenant(Tenant tenant) {
		if (Func.isEmpty(tenant.getId())) {
			List<Tenant> tenants = baseMapper.selectList(
					Wrappers.<Tenant>query().lambda().eq(Tenant::getIsDeleted, KnowledgeConstant.DB_NOT_DELETED));
			List<String> codes = tenants.stream().map(Tenant::getTenantId).collect(Collectors.toList());
			String tenantId = getTenantId(codes);
			tenant.setTenantId(tenantId);
			return super.saveOrUpdate(tenant);
		}
		return super.saveOrUpdate(tenant);
	}

	private String getTenantId(List<String> codes) {
		String code = tenantId.generate();
		if (codes.contains(code)) {
			return getTenantId(codes);
		}
		return code;
	}

}
