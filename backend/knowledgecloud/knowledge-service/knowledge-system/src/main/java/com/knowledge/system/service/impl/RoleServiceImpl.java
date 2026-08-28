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

import java.util.Locale;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.yulichang.toolkit.MPJWrappers;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.knowledge.core.common.base.TenantItemImpl;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.system.converter.RoleConverter;
import lombok.AllArgsConstructor;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.constant.RoleConstant;
import com.knowledge.core.tool.node.ForestNodeMerger;
import com.knowledge.core.tool.utils.CollectionUtil;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.UserRole;
import com.knowledge.system.domain.dto.QueryGroupUserDTO;
import com.knowledge.system.domain.dto.QueryUserDTO;
import com.knowledge.system.domain.dto.QueryUserGroupDTO;
import com.knowledge.system.domain.vo.RoleVO;
import com.knowledge.system.mapper.RoleMapper;
import com.knowledge.system.service.IRoleService;
import com.knowledge.system.service.IUserRoleService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.util.StrUtil;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

import java.util.List;
import java.util.stream.Collectors;

/**
 * 服务实现类
 *
 * @author Chill
 */
@Service
@Validated
@AllArgsConstructor
public class RoleServiceImpl extends ServiceImpl<RoleMapper, Role> implements IRoleService {

	private final static String ROOT_ROLE_NAME = "SITE_MANAGER";
	private final static String ROOT_ROLE_AILAS = "站点管理员";
	private final static Long ROOT_ROLE_PARENT_ID = 0L;

	@Autowired
	private IUserRoleService userRoleService;

	@Override
	public void saveOrUpdateRole(Role role) {
		String tenantId = SecurityContextUtil.getTenantId();
		if (StrUtil.isBlank(tenantId)) {
			throw new BusinessException("tenant is required");
		}
		role.setRoleName(StrUtil.trim(role.getRoleName()));
		role.setRoleAlias(StrUtil.trim(role.getRoleAlias()));
		if (StrUtil.isBlank(role.getRoleName()) || StrUtil.isBlank(role.getRoleAlias())) {
			throw new BusinessException("role name and alias are required");
		}
		if (checkRoleNameExists(role.getRoleName(), role.getId())) {
			throw new BusinessException("role name repeat");
		}
		if (role.getId() != null) {
			Role db = this.lambdaQuery()
					.eq(Role::getTenantId, tenantId)
					.eq(Role::getId, role.getId())
					.one();
			if (db == null) {
				throw new BusinessException("role not found");
			}
			Role updated = RoleConverter.INSTANCE.update(role, db);
			updated.setTenantId(tenantId);
			this.updateById(updated);
		} else {
			role.setTenantId(tenantId);
			this.save(role);
		}
	}

	private boolean checkRoleNameExists(String name, Long excludedRoleId) {
		return this.lambdaQuery()
				.eq(Role::getRoleName, name)
				.eq(TenantItemImpl::getTenantId, SecurityContextUtil.getTenantId())
				.ne(excludedRoleId != null, Role::getId, excludedRoleId)
				.exists();
	}

	@Override
	public IPage<RoleVO> selectRolePage(QueryUserGroupDTO dto) {
		String keyword = StrUtil.trim(dto.getSearchValue());
		return RoleConverter.INSTANCE.convertVO(this.lambdaQuery()
				.eq(Role::getTenantId, SecurityContextUtil.getTenantId())
				.and(StrUtil.isNotBlank(keyword), wrapper -> wrapper
						.like(Role::getRoleName, keyword)
						.or()
						.like(Role::getRoleAlias, keyword))
				.orderByAsc(Role::getSort)
				.orderByAsc(Role::getId)
				.page(dto.page()));
	}

	@Override
	public List<RoleVO> tree(String tenantId) {
		String userRole = SecurityContextUtil.getUserRole();
		String excludeRole = null;
		if (!CollectionUtil.contains(Func.toStrArray(userRole), RoleConstant.ADMIN)) {
			excludeRole = RoleConstant.ADMIN;
		}
		return ForestNodeMerger.merge(baseMapper.tree(tenantId, excludeRole));
	}

	@Override
	public String getRoleIds(String tenantId, String roleNames) {
		List<Role> roleList = baseMapper.selectList(Wrappers.<Role>query().lambda().eq(Role::getTenantId, tenantId)
				.in(Role::getRoleName, Func.toStrList(roleNames)));
		if (roleList != null && roleList.size() > 0) {
			return roleList.stream().map(role -> Func.toStr(role.getId())).distinct().collect(Collectors.joining(","));
		}
		return null;
	}

	@Override
	public List<String> getRoleNames(String roleIds) {
		return baseMapper.getRoleNames(Func.toLongArray(roleIds));
	}

	@Override
	public boolean existsByNameAndTenantId(String roleName, String tenantId) {
		return this.lambdaQuery()
				.eq(TenantItemImpl::getTenantId, tenantId)
				.eq(Role::getRoleName, roleName)
				.exists();
	}

	@Override
	public List<Role> getByClientId(Long id) {
		return this.lambdaQuery()
				.eq(Role::getClientId, id)
				.list();
	}

	@Override
	public void grant(Long userId, Long roleId) {
		Role role = this.getById(roleId);
		if (role == null) {
			throw new BusinessException("role not found");
		}
		String inferredScopeType = KnowledgeConstant.ADMIN_TENANT_ID.equals(role.getTenantId())
				? "PLATFORM"
				: "ORGANIZATION";
		String scopeType = StrUtil.blankToDefault(role.getRoleKind(), inferredScopeType);
		if (StrUtil.isBlank(role.getRoleKind())) {
			role.setRoleKind(scopeType);
			if (StrUtil.isBlank(role.getRoleCode())) {
				role.setRoleCode(StrUtil.blankToDefault(role.getRoleAlias(), role.getRoleName()).toUpperCase(Locale.ROOT));
			}
			if (role.getStatus() == null) {
				role.setStatus(1);
			}
			this.updateById(role);
		}
		UserRole userRole = userRoleService.lambdaQuery()
				.eq(UserRole::getUserId, userId)
				.eq(UserRole::getRoleId, roleId)
				.one();
		if (userRole == null) {
			userRole = new UserRole();
			userRole.setRoleId(roleId);
			userRole.setUserId(userId);
		}
		userRole.setTenantId(role.getTenantId());
		userRole.setScopeType(scopeType);
		userRole.setScopeId(role.getTenantId());
		this.userRoleService.saveOrUpdate(userRole);
	}

	@Override
	public IPage<User> getRoleUsers(QueryUserDTO dto) {
		MPJLambdaWrapper<UserRole> wrapper = MPJWrappers.lambdaJoin(UserRole.class);
		wrapper.leftJoin(User.class, User::getId, UserRole::getUserId)
				.selectAll(User.class)
				.eq(UserRole::getRoleId, dto.getGroupId());
		return this.userRoleService.selectJoinListPage(dto.page(), User.class, wrapper);
	}

	@Override
	public void leaveRole(Long userId, List<Long> roleIds) {
		if (CollUtil.isNotEmpty(roleIds)) {
			this.userRoleService
					.lambdaUpdate()
					.eq(UserRole::getUserId, userId)
					.in(UserRole::getRoleId, roleIds)
					.remove();
		}
	}

	@Override
	public List<Role> getUserRoles(Long userId) {
		MPJLambdaWrapper<UserRole> wrapper = MPJWrappers.lambdaJoin(UserRole.class);
		wrapper.selectAll(Role.class)
				.leftJoin(Role.class, Role::getId, UserRole::getRoleId)
				.eq(UserRole::getUserId, userId);
		return userRoleService.selectJoinList(Role.class, wrapper);
	}

	@Override
	public Role createRoot(String tenantId) {
		Role root = new Role();
		root.setAdmin(true);
		root.setIsDefault(true);
		root.setParentId(ROOT_ROLE_PARENT_ID);
		root.setRoleName(ROOT_ROLE_NAME);
		root.setRoleAlias(ROOT_ROLE_AILAS);
		root.setTenantId(tenantId);
		this.save(root);
		return root;
	}

	private void checkRootExists(String tenantId) {
		boolean exists = this.lambdaQuery()
				.eq(Role::getRoleName, ROOT_ROLE_NAME)
				.eq(Role::getTenantId, tenantId)
				.exists();
		if (exists) {
			throw new BusinessException("");
		}
	}

	@Override
	public Role getRoot(String tenantId) {
		return this.lambdaQuery()
				.eq(Role::getTenantId, tenantId)
				.eq(Role::getParentId, ROOT_ROLE_PARENT_ID)
				.one();
	}

}
