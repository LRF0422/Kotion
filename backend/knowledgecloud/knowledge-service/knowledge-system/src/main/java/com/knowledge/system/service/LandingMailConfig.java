package com.knowledge.system.service;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 邮件通道装配。
 *
 * <p>把 {@code @ConditionalOnMissingBean} 放在 {@code @Configuration} 的
 * {@code @Bean} 方法上，而不是直接标在实现类上：</p>
 * <ul>
 *   <li>组件扫描发现的 {@code LandingMailDispatcher} 实现会在**解析阶段**注册，
 *       而 {@code @Bean} 方法在**加载阶段**才注册，因此这里的条件能够看到
 *       自定义实现并让位；</li>
 *   <li>反过来（把注解放到 {@code @Component} 上）条件会在该 Bean 自身注册时
 *       被评估，结果是把自己排除掉，容器里一个实现都不剩。</li>
 * </ul>
 *
 * <p>若你的自定义实现本身也是通过 {@code @Bean} 方法声明的、且与本类没有
 * 明确的先后关系，请给它加 {@code @Primary} 以确保注入时不会歧义。</p>
 */
@Configuration
public class LandingMailConfig {

	/**
	 * 默认通道：只在没有任何其它 {@link LandingMailDispatcher} 时生效。
	 */
	@Bean
	@ConditionalOnMissingBean(LandingMailDispatcher.class)
	public LandingMailDispatcher landingMailDispatcher() {
		return new LoggingMailDispatcher();
	}
}
