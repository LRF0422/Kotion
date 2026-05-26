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
package com.knowledge.core.secure.config;

import lombok.AllArgsConstructor;
import com.knowledge.core.secure.props.KnowledgeSecureProperties;
import com.knowledge.core.secure.provider.ClientDetailsServiceImpl;
import com.knowledge.core.secure.provider.IClientDetailsService;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 安全配置类
 * 
 * Note: WebMvcConfigurer-based interceptor registration has been removed.
 * Security is now handled by Spring Security via
 * KnowledgeSecurityConfiguration.
 * JwtTokenProvider is now a @Component and auto-configured.
 *
 * @author Chill
 */
@Order
@AutoConfiguration
@AllArgsConstructor
@EnableConfigurationProperties({ KnowledgeSecureProperties.class })
public class SecureConfiguration {

	private final JdbcTemplate jdbcTemplate;

	@Bean
	@ConditionalOnMissingBean(IClientDetailsService.class)
	public IClientDetailsService clientDetailsService() {
		return new ClientDetailsServiceImpl(jdbcTemplate);
	}

}
