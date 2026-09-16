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

package com.knowledge.core.log.utils;

import com.knowledge.core.launch.props.KnowledgeProperties;
import com.knowledge.core.launch.server.ServerInfo;
import com.knowledge.core.log.model.LogAbstract;
import com.knowledge.core.secure.utils.SecureUtil;
import com.knowledge.core.tool.utils.*;

import javax.servlet.http.HttpServletRequest;

/**
 * Log 相关工具
 *
 * @author Chill
 */
public class LogAbstractUtil {

	/**
	 * 日志写入接口（LogClient）的路径后缀
	 */
	private static final String[] LOG_WRITE_PATHS = {
			"/log/saveApiLog", "/log/saveUsualLog", "/log/saveErrorLog", "/log/saveLoginLog"
	};

	/**
	 * 判断当前请求是否就是日志写入接口。
	 * <p>
	 * 写日志链路本身是：业务失败 -> 发布错误日志事件 -> feign 调用日志服务 -> 写日志。
	 * 一旦写日志失败（表不存在 / 字段不匹配 / 日志服务不可用等），如果继续发布日志事件，
	 * 就会不断自我调用形成死循环，最终打爆线程池或栈。因此在发布事件前先拦截。
	 *
	 * @param request 当前请求，可能为 null（异步线程 / 非 web 场景）
	 * @return true 表示当前正处于日志写入请求中
	 */
	public static boolean isLogWriteRequest(HttpServletRequest request) {
		if (request == null) {
			return false;
		}
		if (matchesLogWritePath(request.getRequestURI())) {
			return true;
		}
		// 错误转发到 /error 时，原始请求地址保存在该属性里，同样需要识别
		Object originalUri = request.getAttribute("javax.servlet.error.request_uri");
		return originalUri != null && matchesLogWritePath(String.valueOf(originalUri));
	}

	private static boolean matchesLogWritePath(String uri) {
		if (uri == null) {
			return false;
		}
		String path;
		try {
			path = UrlUtil.getPath(uri);
		} catch (Exception e) {
			return false;
		}
		if (path == null) {
			return false;
		}
		for (String writePath : LOG_WRITE_PATHS) {
			if (path.endsWith(writePath)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 向log中添加补齐request的信息
	 *
	 * @param request     请求
	 * @param logAbstract 日志基础类
	 */
	public static void addRequestInfoToLog(HttpServletRequest request, LogAbstract logAbstract) {
		if (ObjectUtil.isNotEmpty(request)) {
			logAbstract.setRemoteIp(WebUtil.getIP(request));
			logAbstract.setUserAgent(request.getHeader(WebUtil.USER_AGENT_HEADER));
			logAbstract.setRequestUri(UrlUtil.getPath(request.getRequestURI()));
			logAbstract.setMethod(request.getMethod());
			logAbstract.setParams(WebUtil.getRequestParamString(request));
			logAbstract.setCreateBy(SecureUtil.getUserAccount(request));
		}
	}

	/**
	 * 向log中添加补齐其他的信息（eg：knowledge、server等）
	 *
	 * @param logAbstract     日志基础类
	 * @param knowledgeProperties 配置信息
	 * @param serverInfo      服务信息
	 */
	public static void addOtherInfoToLog(LogAbstract logAbstract, KnowledgeProperties knowledgeProperties, ServerInfo serverInfo) {
		logAbstract.setServiceId(knowledgeProperties.getName());
		logAbstract.setServerHost(serverInfo.getHostName());
		logAbstract.setServerIp(serverInfo.getIpWithPort());
		logAbstract.setEnv(knowledgeProperties.getEnv());
		logAbstract.setCreateTime(DateUtil.now());

		//这里判断一下params为null的情况，否则knowledge-log服务在解析该字段的时候，可能会报出NPE
		if (logAbstract.getParams() == null) {
			logAbstract.setParams(StringPool.EMPTY);
		}
	}
}
