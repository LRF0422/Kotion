package com.knowledge.system.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

/**
 * 默认邮件通道：只写日志，不做真实投递。
 *
 * <p>本模块没有 SMTP 客户端依赖，真实实现应注册为 {@link LandingMailDispatcher}
 * 的 Bean，例如复用 {@code knowledge-message} 的 {@code EmailMessageProvider}
 * 以 HTTP 方式转发，或接入外部 ESP。默认实现保证「活动创建 → 目标解析 →
 * 投递记录 → 计数」整条链路在没有邮件凭据的环境下依然可测。</p>
 *
 * <p>标注 {@code @ConditionalOnMissingBean}，因此一旦容器里存在别的
 * {@code LandingMailDispatcher} 实现，本类不会生效。</p>
 */
@Slf4j
@Component
@ConditionalOnMissingBean(LandingMailDispatcher.class)
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
