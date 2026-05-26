/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the GNU LESSER GENERAL PUBLIC LICENSE 3.0;
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.gnu.org/licenses/lgpl.html
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.core.launch.constant;

/**
 * Token配置常量.
 *
 * @author Chill
 */
public interface TokenConstant {

	/**
	 * JWT signing key.
	 * 
	 * @deprecated This hard-coded key is deprecated. Use the configurable property
	 *             {@code knowledge.security.jwt.secret-key} instead, which is read
	 *             by {@code JwtTokenProvider}. This constant is kept for backward
	 *             compatibility during the migration period.
	 */
	@Deprecated
	String SIGN_KEY = "knowledgexisapowerfulmicroservicearchitectureupgradedandoptimizedfromacommercialproject";
	String AVATAR = "avatar";
	String HEADER = "knowledge-auth";
	String BEARER = "bearer";
	String ACCESS_TOKEN = "access_token";
	String REFRESH_TOKEN = "refresh_token";
	String TOKEN_TYPE = "token_type";
	String EXPIRES_IN = "expires_in";
	String ACCOUNT = "account";
	String USER_ID = "user_id";
	String ROLE_ID = "role_id";
	String DEPT_ID = "dept_id";
	String USER_NAME = "user_name";
	String ROLE_NAME = "role_name";
	String TENANT_ID = "tenant_id";
	String OAUTH_ID = "oauth_id";
	String CLIENT_ID = "client_id";
	String LICENSE = "license";
	String USER_ROLES = "user_roles";
	String LICENSE_NAME = "powered by knowledge";
	String DEFAULT_AVATAR = "https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png";
	Integer AUTH_LENGTH = 7;
	String CURRENT_INSTALL_APP_ID = "current_install_app_id";

}
