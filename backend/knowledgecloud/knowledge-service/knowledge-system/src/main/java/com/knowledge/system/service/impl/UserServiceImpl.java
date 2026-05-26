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
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.github.yulichang.toolkit.MPJWrappers;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.knowledge.core.common.base.TenantItemImpl;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.system.dto.QueryUserDTO;
import lombok.AllArgsConstructor;
import com.knowledge.common.constant.CommonConstant;
import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.core.tool.utils.*;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.UserRole;
import com.knowledge.system.mapper.UserMapper;
import com.knowledge.system.service.IUserService;

import cn.hutool.core.util.StrUtil;

import org.springframework.stereotype.Service;

import java.util.Date;
import java.util.List;

/**
 * 服务实现类
 *
 * @author Chill
 */
@Service
@AllArgsConstructor
public class UserServiceImpl extends MPJBaseServiceImpl<UserMapper, User> implements IUserService {

	@Override
	public boolean submit(User user) {
		if (Func.isNotEmpty(user.getPassword())) {
			user.setPassword(DigestUtil.encrypt(user.getPassword()));
		}
		Long cnt = baseMapper.selectCount(Wrappers.<User>query().lambda().eq(User::getTenantId, user.getTenantId())
				.eq(User::getAccount, user.getAccount()));
		if (cnt > 0) {
			throw new ServiceException("当前用户已存在!");
		}
		return saveOrUpdate(user);
	}

	@Override
	public IPage<User> selectUserPage(IPage<User> page, User user) {
		return page.setRecords(baseMapper.selectUserPage(page, user));
	}

	@Override
	public IPage<User> userList(QueryUserDTO dto) {
		IPage<User> userIPage = this.lambdaQuery()
				.like(StringUtil.isNotBlank(dto.getSearchValue()), User::getRealName, dto.getSearchValue())
				.like(StringUtil.isNotBlank(dto.getSearchValue()), User::getName, dto.getSearchValue())
				.like(StringUtil.isNotBlank(dto.getSearchValue()), User::getAccount, dto.getSearchValue())
				.page(new Page<>(dto.getCurrent(), dto.getSize()));
		return userIPage;
	}

	@Override
	public User userInfo(Long userId) {
		User user = baseMapper.selectById(userId);
		return user;
	}

	@Override
	public User userInfo(String tenantId, String account, String password) {
		if (StrUtil.isEmpty(tenantId)) {
			return this.lambdaQuery().eq(User::getAccount, account)
					.eq(User::getPassword, password)
					.one();
		}
		User user = baseMapper.getUser(tenantId, account, password);
		return user;
	}

	@Override
	public boolean grant(String userIds, String roleIds) {
		User user = new User();
		user.setRoleId(roleIds);
		return this.update(user, Wrappers.<User>update().lambda().in(User::getId, Func.toLongList(userIds)));
	}

	@Override
	public boolean resetPassword(String userIds) {
		User user = new User();
		user.setPassword(DigestUtil.encrypt(CommonConstant.DEFAULT_PASSWORD));
		return this.update(user, Wrappers.<User>update().lambda().in(User::getId, Func.toLongList(userIds)));
	}

	@Override
	public boolean updatePassword(Long userId, String oldPassword, String newPassword, String newPassword1) {
		User user = getById(userId);
		if (!newPassword.equals(newPassword1)) {
			throw new ServiceException("请输入正确的确认密码!");
		}
		if (!user.getPassword().equals(DigestUtil.encrypt(oldPassword))) {
			throw new ServiceException("原密码不正确!");
		}
		return this.update(Wrappers.<User>update().lambda().set(User::getPassword, DigestUtil.encrypt(newPassword))
				.eq(User::getId, userId));
	}

	@Override
	public List<String> getRoleName(String roleIds) {
		return baseMapper.getRoleName(Func.toStrArray(roleIds));
	}

	@Override
	public List<String> getDeptName(String deptIds) {
		return baseMapper.getDeptName(Func.toStrArray(deptIds));
	}

	@Override
	public boolean existsByAccount(String account) {
		return this.lambdaQuery()
				.eq(User::getAccount, account)
				.eq(TenantItemImpl::getTenantId, SecurityContextUtil.getTenantId())
				.exists();
	}

	@Override
	public void setup(String account, String avatar, String nickName, String realName, String password) {
		this.lambdaUpdate()
				.eq(User::getAccount, account)
				.eq(User::getTenantId, SecurityContextUtil.getTenantId())
				.set(User::getRealName, realName)
				.set(User::getName, nickName)
				.set(User::getAvatar, avatar)
				.set(User::getPassword, DigestUtil.encrypt(password))
				.set(User::getIsSetup, true)
				.update();
	}

	@Override
	public List<User> getUsersWithRole(Long roleId) {
		MPJLambdaWrapper<User> wrapper = MPJWrappers.lambdaJoin(User.class);
		wrapper.leftJoin(UserRole.class, UserRole::getUserId, User::getId)
				.leftJoin(Role.class, Role::getId, UserRole::getRoleId)
				.eq(Role::getId, roleId);

		return this.selectJoinList(User.class, wrapper);

	}

	@Override
	public void createUser(User user) {
		if (this.existsByAccount(user.getAccount())) {
			throw new BusinessException(5003, "用户名已存在");
		}
		this.submit(user);
	}

}
