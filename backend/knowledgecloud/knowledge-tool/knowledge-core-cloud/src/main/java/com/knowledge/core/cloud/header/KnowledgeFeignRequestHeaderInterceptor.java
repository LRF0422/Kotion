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
package com.knowledge.core.cloud.header;

import com.google.common.collect.Lists;
import com.knowledge.core.cloud.auth.ServiceTokenProvider;
import com.knowledge.core.tool.utils.WebUtil;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;

import javax.servlet.http.HttpServletRequest;

import java.util.ArrayList;
import java.util.Enumeration;

/**
 * feign 传递Request header
 *
 * <p>
 * https://blog.csdn.net/u014519194/article/details/77160958
 * http://tietang.wang/2016/02/25/hystrix/Hystrix%E5%8F%82%E6%95%B0%E8%AF%A6%E8%A7%A3/
 * https://github.com/Netflix/Hystrix/issues/92#issuecomment-260548068
 * </p>
 *
 * @author L.cm
 */
@Slf4j
public class KnowledgeFeignRequestHeaderInterceptor implements RequestInterceptor {

	private final ServiceTokenProvider serviceTokenProvider;

	public KnowledgeFeignRequestHeaderInterceptor(ServiceTokenProvider serviceTokenProvider) {
		this.serviceTokenProvider = serviceTokenProvider;
	}

	@Override
	public void apply(RequestTemplate requestTemplate) {
		HttpServletRequest request = WebUtil.getRequest();
		if (request != null) {
			// Forward headers from incoming HTTP request
			Enumeration<String> headerNames = request.getHeaderNames();

			while (headerNames.hasMoreElements()) {
				String name = headerNames.nextElement();
				// 不能把所有消息头都传递下去，否则会引起其他异常；header的name都是小写
				if (checkEssential(name)) {
					requestTemplate.header(name, request.getHeader(name));
				}
			}
		} else {
			// No HTTP context (e.g., background job, service startup) — use service account
			// token
			if (serviceTokenProvider != null) {
				log.debug("No HTTP request context, using service account token for Feign call");
				String serviceToken = serviceTokenProvider.getServiceToken();
				requestTemplate.header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceToken);
			} else {
				log.warn("No HTTP request context and ServiceTokenProvider is not available");
			}
		}
	}

	private boolean checkEssential(String name) {
		ArrayList<String> headers = Lists.newArrayList("Authorization", "Knowledge-Auth");
		return headers.stream().anyMatch(e -> e.equalsIgnoreCase(name));
	}
}
