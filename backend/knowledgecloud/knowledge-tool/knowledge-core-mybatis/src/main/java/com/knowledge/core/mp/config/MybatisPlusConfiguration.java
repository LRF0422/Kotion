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
package com.knowledge.core.mp.config;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import lombok.AllArgsConstructor;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.StringValue;
import org.mybatis.spring.annotation.MapperScan;
import com.knowledge.core.mp.intercept.QueryInterceptor;
import com.knowledge.core.mp.plugins.KnowledgePaginationInterceptor;
import com.knowledge.core.mp.plugins.SqlLogInterceptor;
import com.knowledge.core.mp.props.MybatisPlusProperties;
import com.knowledge.core.secure.utils.SecureUtil;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.core.tool.utils.ObjectUtil;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.AnnotationAwareOrderComparator;

/**
 * mybatisplus 配置
 *
 * @author Chill
 */
@AutoConfiguration
@AllArgsConstructor
@MapperScan("com.knowledge.**.mapper.**")
@EnableConfigurationProperties(MybatisPlusProperties.class)
public class MybatisPlusConfiguration {


	/**
	 * 租户拦截器
	 */
	@Bean
	@ConditionalOnMissingBean(TenantLineInnerInterceptor.class)
	public TenantLineInnerInterceptor tenantLineInnerInterceptor() {
		return new TenantLineInnerInterceptor(new TenantLineHandler() {
			@Override
			public Expression getTenantId() {
				return new StringValue(Func.toStr(SecureUtil.getTenantId(), KnowledgeConstant.ADMIN_TENANT_ID));
			}

			@Override
			public boolean ignoreTable(String tableName) {
				return true;
			}
		});
	}

	/**
	 * mybatis-plus 拦截器集合
	 */
	@Bean
	@ConditionalOnMissingBean(MybatisPlusInterceptor.class)
	public MybatisPlusInterceptor mybatisPlusInterceptor(ObjectProvider<QueryInterceptor[]> queryInterceptors,
														 TenantLineInnerInterceptor tenantLineInnerInterceptor,
														 MybatisPlusProperties mybatisPlusProperties) {
		MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
		// 配置租户拦截器
		interceptor.addInnerInterceptor(tenantLineInnerInterceptor);
		// 配置分页拦截器
		KnowledgePaginationInterceptor paginationInterceptor = new KnowledgePaginationInterceptor();
		// 配置自定义查询拦截器
		QueryInterceptor[] queryInterceptorArray = queryInterceptors.getIfAvailable();
		if (ObjectUtil.isNotEmpty(queryInterceptorArray)) {
			AnnotationAwareOrderComparator.sort(queryInterceptorArray);
			paginationInterceptor.setQueryInterceptors(queryInterceptorArray);
		}
		paginationInterceptor.setMaxLimit(mybatisPlusProperties.getPageLimit());
		paginationInterceptor.setOverflow(mybatisPlusProperties.getOverflow());
		interceptor.addInnerInterceptor(paginationInterceptor);
		return interceptor;
	}

	/**
	 * sql 日志
	 *
	 * @return SqlLogInterceptor
	 */
	@Bean
	@ConditionalOnProperty(value = "knowledge.mybatis-plus.sql-log", matchIfMissing = true)
	public SqlLogInterceptor sqlLogInterceptor() {
		return new SqlLogInterceptor();
	}

}

