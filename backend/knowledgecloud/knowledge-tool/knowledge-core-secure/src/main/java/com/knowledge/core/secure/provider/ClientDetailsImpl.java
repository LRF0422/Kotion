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
package com.knowledge.core.secure.provider;

import io.swagger.annotations.ApiModelProperty;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 客户端详情
 *
 * @author Chill
 */
@Data
public class ClientDetailsImpl implements IClientDetails {

	/**
	 * 客户端id
	 */
	@ApiModelProperty(value = "客户端id")
	private String clientId;

	private Set<String> resourceIds;

	private boolean secretRequired;
	/**
	 * 客户端密钥
	 */
	@ApiModelProperty(value = "客户端密钥")
	private String clientSecret;

	/**
	 * 令牌过期秒数
	 */
	@ApiModelProperty(value = "令牌过期秒数")
	private Integer accessTokenValidity;
	/**
	 * 刷新令牌过期秒数
	 */
	@ApiModelProperty(value = "刷新令牌过期秒数")
	private Integer refreshTokenValidity;

	private Set<String> scope;

	private boolean scoped;

	private Set<String> authorizedGrantTypes;

	private Map<String, Object> additionalInformation;

	private Integer accessTokenValiditySeconds;

	private Integer refreshTokenValiditySeconds;


	private Set<String> registeredRedirectUri;

}
