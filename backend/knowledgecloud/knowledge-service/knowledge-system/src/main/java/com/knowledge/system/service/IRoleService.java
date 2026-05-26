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
package com.knowledge.system.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.service.IService;
import com.knowledge.system.domain.Role;
import com.knowledge.system.domain.User;
import com.knowledge.system.domain.dto.QueryUserDTO;
import com.knowledge.system.domain.dto.QueryUserGroupDTO;
import com.knowledge.system.domain.vo.RoleVO;

import java.util.List;

/**
 * 服务类
 *
 * @author Chill
 */
public interface IRoleService extends IService<Role> {

	void saveOrUpdateRole(Role role);

	Role createRoot(String tenantId);

	Role getRoot(String tenantId);

	IPage<RoleVO> selectRolePage(QueryUserGroupDTO dto);

	IPage<User> getRoleUsers(QueryUserDTO dto);

	List<RoleVO> tree(String tenantId);

	String getRoleIds(String tenantId, String roleNames);

	void grant(Long userId, Long roleId);

	List<String> getRoleNames(String roleIds);

	boolean existsByNameAndTenantId(String roleName, String tenantId);

	List<Role> getByClientId(Long id);

	void leaveRole(Long userId, List<Long> roleIds);

	List<Role> getUserRoles(Long userId);

}
