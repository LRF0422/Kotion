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
package com.knowledge.core.secure.registry;

import lombok.Data;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * secure api放行配置
 *
 * @author Chill
 */
@Data
public class SecureRegistry {

	private boolean enabled = true;

	private final List<String> defaultExcludePatterns = new ArrayList<>();

	private final List<String> excludePatterns = new ArrayList<>();

	public SecureRegistry() {
		this.defaultExcludePatterns.add("/actuator/health/**");
		this.defaultExcludePatterns.add("/v2/api-docs/**");
		this.defaultExcludePatterns.add("/auth/**");
		this.defaultExcludePatterns.add("/token/**");
		this.defaultExcludePatterns.add("/log/**");
		this.defaultExcludePatterns.add("/user/user-info");
		this.defaultExcludePatterns.add("/user/user-info-by-id");
		this.defaultExcludePatterns.add("/menu/auth-routes");
		this.defaultExcludePatterns.add("/sys/meta");
		this.defaultExcludePatterns.add("/error/**");
		this.defaultExcludePatterns.add("/assets/**");
		// Note: PathPatternParser does not allow ** in middle of patterns
		// Use /public/** and /*/public/** to match public paths at root and one level
		// deep
		this.defaultExcludePatterns.add("/public/**");
		this.defaultExcludePatterns.add("/*/public/**");
	}

	/**
	 * 设置放行api
	 */
	public SecureRegistry excludePathPatterns(String... patterns) {
		return excludePathPatterns(Arrays.asList(patterns));
	}

	/**
	 * 设置放行api
	 */
	public SecureRegistry excludePathPatterns(List<String> patterns) {
		this.excludePatterns.addAll(patterns);
		return this;
	}

	/**
	 * Gets all excluded paths as a String array.
	 * This combines both default and custom exclude patterns.
	 *
	 * @return array of all excluded path patterns
	 */
	public String[] getExcludedPaths() {
		List<String> allPaths = new ArrayList<>();
		allPaths.addAll(defaultExcludePatterns);
		allPaths.addAll(excludePatterns);
		return allPaths.toArray(new String[0]);
	}

}
