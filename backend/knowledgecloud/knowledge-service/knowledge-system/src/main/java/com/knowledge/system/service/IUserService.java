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
import com.github.yulichang.base.MPJBaseService;
import com.knowledge.system.dto.QueryUserDTO;
import com.knowledge.system.domain.User;
import java.util.List;

/**
 * 服务类
 *
 * @author Chill
 */
public interface IUserService extends MPJBaseService<User> {

	boolean submit(User user);

	IPage<User> selectUserPage(IPage<User> page, User user);

	IPage<User> userList(QueryUserDTO dto);

	User userInfo(Long userId);

	User userInfo(String tenantId, String account, String password);

	boolean grant(String userIds, String roleIds);

	boolean resetPassword(String userIds);

	boolean updatePassword(Long userId, String oldPassword, String newPassword, String newPassword1);

	List<String> getRoleName(String roleIds);

	List<String> getDeptName(String deptIds);

	boolean existsByAccount(String account);

	void createUser(User user);

	void setup(String account, String avatar, String nickName, String realName, String password);

	List<User> getUsersWithRole(Long roleId);
}
