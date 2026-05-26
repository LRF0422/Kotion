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
package com.knowledge.system.feign;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.dto.GrantRolesDTO;
import com.knowledge.system.dto.QueryUserDTO;
import com.knowledge.system.vo.RoleFO;
import com.knowledge.system.vo.UserInfo;
import com.knowledge.system.vo.UserVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * User Feign接口类
 *
 * @author Chill
 */
@FeignClient(value = AppConstant.APPLICATION_SYSTEM_NAME)
public interface IUserClient {

	String API_PREFIX = "/user";

	/**
	 * 获取用户信息
	 *
	 * @param userId 用户id
	 * @return
	 */
	@GetMapping(API_PREFIX + "/user-info-by-id")
	R<UserInfo> userInfo(@RequestParam("userId") Long userId);

	/**
	 * 获取用户信息
	 *
	 * @param tenantId 租户ID
	 * @param account  账号
	 * @param password 密码
	 * @return
	 */
	@GetMapping(API_PREFIX + "/user-info")
	R<UserInfo> userInfo(@RequestParam(value = "tenantId", required = false) String tenantId,
			@RequestParam("account") String account,
			@RequestParam("password") String password);

	@PostMapping(API_PREFIX + "/list")
	R<IPage<KnowledgeUser>> list(@RequestBody QueryUserDTO dto);

	@PostMapping(API_PREFIX + "/grantRoles")
	R<?> grantRoles(@RequestBody GrantRolesDTO dto);

	@PostMapping(API_PREFIX + "/listByIds")
	R<List<KnowledgeUser>> listByIds(@RequestBody List<Long> ids);

	@GetMapping(API_PREFIX + "/getById")
	R<KnowledgeUser> getUserById(@RequestParam("id") Long id);

	@GetMapping(API_PREFIX + "/getByAccount/{accounts}")
	R<List<KnowledgeUser>> getByAccount(@PathVariable("accounts") List<String> accounts);

	@GetMapping(API_PREFIX + "/search")
	R<IPage<KnowledgeUser>> searchUsers(@RequestParam("keyword") String keyword,
			@RequestParam(value = "pageSize", required = false, defaultValue = "10") Integer pageSize);

}
