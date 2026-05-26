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

package com.knowledge.core.log.config;

import lombok.AllArgsConstructor;
import com.knowledge.core.launch.props.KnowledgeProperties;
import com.knowledge.core.launch.server.ServerInfo;
import com.knowledge.core.log.aspect.ApiLogAspect;
import com.knowledge.core.log.event.ApiLogListener;
import com.knowledge.core.log.event.ErrorLogListener;
import com.knowledge.core.log.event.UsualLogListener;
import com.knowledge.core.log.feign.ILogClient;
import com.knowledge.core.log.logger.KnowledgeLogger;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;

/**
 * 日志工具自动配置
 *
 * @author Chill
 */
@AutoConfiguration
@AllArgsConstructor
@ConditionalOnWebApplication
public class KnowledgeLogToolAutoConfiguration {

	private final ILogClient logService;
	private final ServerInfo serverInfo;
	private final KnowledgeProperties knowledgeProperties;

	@Bean
	public ApiLogAspect apiLogAspect() {
		return new ApiLogAspect();
	}

	@Bean
	public KnowledgeLogger knowledgeLogger() {
		return new KnowledgeLogger();
	}

	@Bean
	public ApiLogListener apiLogListener() {
		return new ApiLogListener(logService, serverInfo, knowledgeProperties);
	}

	@Bean
	public ErrorLogListener errorEventListener() {
		return new ErrorLogListener(logService, serverInfo, knowledgeProperties);
	}

	@Bean
	public UsualLogListener knowledgeEventListener() {
		return new UsualLogListener(logService, serverInfo, knowledgeProperties);
	}

}
