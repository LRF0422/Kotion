/**
 * Copyright (c) 2018-2028, DreamLu 卢春梦 (qq596392912@gmail.com).
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

package com.knowledge.core.test;


import org.junit.jupiter.api.extension.ExtensionContext;
import com.knowledge.core.launch.KnowledgeApplication;
import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.launch.constant.NacosConstant;
import com.knowledge.core.launch.constant.SentinelConstant;
import com.knowledge.core.launch.service.LauncherService;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.core.annotation.AnnotationUtils;
import org.springframework.lang.NonNull;
import org.springframework.test.context.junit.jupiter.SpringExtension;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 设置启动参数
 *
 * @author L.cm
 */
public class KnowledgeSpringExtension extends SpringExtension {

	@Override
	public void beforeAll(@NonNull ExtensionContext context) throws Exception {
		super.beforeAll(context);
		setUpTestClass(context);
	}

	private void setUpTestClass(ExtensionContext context) {
		Class<?> clazz = context.getRequiredTestClass();
		KnowledgeBootTest knowledgeBootTest = AnnotationUtils.getAnnotation(clazz, KnowledgeBootTest.class);
		if (knowledgeBootTest == null) {
			throw new KnowledgeBootTestException(String.format("%s must be @knowledgeBootTest .", clazz));
		}
		String appName = knowledgeBootTest.appName();
		String profile = knowledgeBootTest.profile();
		boolean isLocalDev = KnowledgeApplication.isLocalDev();
		Properties props = System.getProperties();
		props.setProperty("knowledge.env", profile);
		props.setProperty("knowledge.name", appName);
		props.setProperty("knowledge.is-local", String.valueOf(isLocalDev));
		props.setProperty("knowledge.dev-mode", profile.equals(AppConstant.PROD_CODE) ? "false" : "true");
		props.setProperty("knowledge.service.version", AppConstant.APPLICATION_VERSION);
		props.setProperty("spring.application.name", appName);
		props.setProperty("spring.profiles.active", profile);
		props.setProperty("info.version", AppConstant.APPLICATION_VERSION);
		props.setProperty("info.desc", appName);
		props.setProperty("spring.cloud.nacos.discovery.server-addr", NacosConstant.NACOS_ADDR);
		props.setProperty("spring.cloud.nacos.config.server-addr", NacosConstant.NACOS_ADDR);
		props.setProperty("spring.cloud.nacos.config.prefix", NacosConstant.NACOS_CONFIG_PREFIX);
		props.setProperty("spring.cloud.nacos.config.file-extension", NacosConstant.NACOS_CONFIG_FORMAT);
		props.setProperty("spring.cloud.sentinel.transport.dashboard", SentinelConstant.SENTINEL_ADDR);
		props.setProperty("spring.main.allow-bean-definition-overriding", "true");
		// 加载自定义组件
		if (knowledgeBootTest.enableLoader()) {
			List<LauncherService> launcherList = new ArrayList<>();
			SpringApplicationBuilder builder = new SpringApplicationBuilder(clazz);
			ServiceLoader.load(LauncherService.class).forEach(launcherList::add);
			launcherList.stream().sorted(Comparator.comparing(LauncherService::getOrder)).collect(Collectors.toList())
				.forEach(launcherService -> launcherService.launcher(builder, appName, profile));
		}
		System.err.printf("---[junit.test]:[%s]---启动中，读取到的环境变量:[%s]%n", appName, profile);
	}

}
