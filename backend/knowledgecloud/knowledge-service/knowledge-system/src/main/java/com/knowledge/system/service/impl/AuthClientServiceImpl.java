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

import com.knowledge.core.common.base.BaseService;
import com.knowledge.core.common.base.IConverter;
import com.knowledge.core.tool.exception.BusinessExceptionAssert;
import com.knowledge.system.domain.AuthApp;
import com.knowledge.system.domain.enums.AppType;
import com.knowledge.system.mapper.AuthClientMapper;
import com.knowledge.system.service.IAuthClientService;
import com.knowledge.system.vo.ClientVO;

import java.util.List;

import org.springframework.stereotype.Service;

/**
 * 服务实现类
 *
 * @author Chill
 */
@Service
public class AuthClientServiceImpl extends BaseService<AuthClientMapper, AuthApp> implements IAuthClientService {

	@Override
	public ClientVO clientInfo(Long id) {
		AuthApp client = this.getById(id);
		ClientVO clientVO = new ClientVO();
		return null;
	}

	@Override
	public AuthApp getByAppId(String appId) {
		return this.lambdaQuery()
				.eq(AuthApp::getClientId, appId)
				.one();
	}

	@Override
	public void registerClient(AuthApp app) {

	}

	private boolean checkExists(AuthApp app) {
		return this.lambdaQuery()
				.eq(AuthApp::getClientId, app.getClientId())
				.exists();
	}

	@Override
	public List<AuthApp> getAvaliableApps() {
		return this.lambdaQuery()
				.list();
	}

	@Override
	public List<AuthApp> getBasicApps() {
		return this.lambdaQuery()
				.eq(AuthApp::getAppType, AppType.BASE)
				.list();
	}
}
