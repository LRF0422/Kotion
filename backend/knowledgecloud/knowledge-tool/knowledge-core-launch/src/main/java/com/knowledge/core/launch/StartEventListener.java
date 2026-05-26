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
package com.knowledge.core.launch;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.event.ApplicationStartedEvent;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Async;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * 项目启动事件通知
 *
 * @author Chill
 */
@Slf4j
@AutoConfiguration
public class StartEventListener {

	/**
	 * 需要脱敏的配置key关键字
	 */
	private static final String[] SENSITIVE_KEYWORDS = { "password", "secret", "api-key", "apikey", "api_key",
			"sign-key" };

	/**
	 * 需要输出的配置key列表
	 */
	private static final String[] CONFIG_KEYS = {
			// Server
			"server.port",
			"server.servlet.context-path",
			"server.undertow.threads.io",
			"server.undertow.threads.worker",
			// DataSource
			"spring.datasource.url",
			"spring.datasource.username",
			"spring.datasource.password",
			"spring.datasource.driver-class-name",
			// Redis
			"spring.data.redis.host",
			"spring.data.redis.port",
			"spring.data.redis.password",
			"spring.data.redis.database",
			"spring.redis.host",
			"spring.redis.port",
			"spring.redis.password",
			"spring.redis.database",
			// Nacos
			"spring.cloud.nacos.discovery.server-addr",
			"spring.cloud.nacos.discovery.namespace",
			"spring.cloud.nacos.config.server-addr",
			"spring.cloud.nacos.config.namespace",
			// Sentinel
			"spring.cloud.sentinel.transport.dashboard",
			// RocketMQ
			"knowledge.rocketmq.enable",
			"knowledge.rocketmq.producer.namesrvAddr",
			"knowledge.rocketmq.consumer.namesrvAddr",
			// Seata
			"spring.cloud.alibaba.seata.tx-service-group",
			// Servlet / Upload
			"spring.servlet.multipart.max-file-size",
			"spring.servlet.multipart.max-request-size",
			// Blade Datasource
			"blade.datasource.dev.url",
			"blade.datasource.dev.username",
			"blade.datasource.dev.password",
			"blade.datasource.test.url",
			"blade.datasource.test.username",
			"blade.datasource.prod.url",
			"blade.datasource.prod.username",
			// Agent
			"agent.default-provider",
			"agent.default-model",
			// Knowledge
			"knowledge.env",
			"knowledge.name",
			"knowledge.is-local",
			"knowledge.dev-mode",
			"knowledge.service.version",
	};

	/**
	 * 应用启动后输出YML配置参数
	 */
	@EventListener(ApplicationStartedEvent.class)
	public void onApplicationStarted(ApplicationStartedEvent event) {
		Environment env = event.getApplicationContext().getEnvironment();
		List<String> lines = new ArrayList<>();

		for (String key : CONFIG_KEYS) {
			String value = env.getProperty(key);
			if (value != null) {
				String displayValue = maskIfNeeded(key, value);
				lines.add(String.format("  %-55s : %s", key, displayValue));
			}
		}

		StringBuilder sb = new StringBuilder();
		sb.append("\n----------------------------------------------------------");
		sb.append("\n  系统配置参数 (YML Configuration)");
		sb.append("\n----------------------------------------------------------");
		for (String line : lines) {
			sb.append("\n").append(line);
		}
		sb.append("\n----------------------------------------------------------");

		log.info(sb.toString());
	}

	@Async
	@Order
	@EventListener(WebServerInitializedEvent.class)
	public void afterStart(WebServerInitializedEvent event) {
		Environment env = event.getApplicationContext().getEnvironment();
		String appName = env.getProperty("spring.application.name", "unknown").toUpperCase();
		int localPort = event.getWebServer().getPort();
		String profile = StringUtils.arrayToCommaDelimitedString(env.getActiveProfiles());
		log.info("---[{}]---启动完成，当前使用的端口:[{}]，环境变量:[{}]---", appName, localPort, profile);
	}

	/**
	 * 对敏感配置值进行脱敏处理
	 */
	private String maskIfNeeded(String key, String value) {
		String lowerKey = key.toLowerCase();
		for (String keyword : SENSITIVE_KEYWORDS) {
			if (lowerKey.contains(keyword)) {
				if (value.length() <= 3) {
					return "***";
				}
				return value.substring(0, 2) + "***" + value.substring(value.length() - 2);
			}
		}
		return value;
	}
}
