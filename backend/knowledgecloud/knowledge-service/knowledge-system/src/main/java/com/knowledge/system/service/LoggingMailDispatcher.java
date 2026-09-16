package com.knowledge.system.service;

import lombok.extern.slf4j.Slf4j;

/**
 * 默认邮件通道：只写日志，不做真实投递。
 *
 * <p>本模块没有 SMTP 客户端依赖，真实实现应由部署方提供，例如复用
 * {@code knowledge-message} 的 {@code EmailMessageProvider} 以 HTTP 方式转发，
 * 或接入外部 ESP。默认实现保证「活动创建 → 目标解析 → 投递记录 → 计数」
 * 整条链路在没有邮件凭据的环境下依然可测。</p>
 *
 * <p><b>注意</b>：本类**不加** {@code @Component}，也不加
 * {@code @ConditionalOnMissingBean} —— 后者必须写在 auto-configuration 或
 * {@code @Configuration} 的 {@code @Bean} 方法上；直接标在组件扫描类上时，
 * 条件会在该 Bean 自身注册的过程中被评估，导致把自己排除掉，最终容器里
 * 一个 {@code LandingMailDispatcher} 都没有（表现为启动报
 * "required a bean of type ... that could not be found"）。
 * 装配见 {@link LandingMailConfig}。</p>
 */
@Slf4j
public class LoggingMailDispatcher implements LandingMailDispatcher {

	@Override
	public boolean send(String to, String subject, String html) {
		log.info("[landing-mail] to={} subject={}", to, subject);
		return true;
	}

	@Override
	public String name() {
		return "logging";
	}
}
