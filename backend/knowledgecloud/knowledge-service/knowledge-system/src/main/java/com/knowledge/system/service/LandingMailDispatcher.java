package com.knowledge.system.service;

/**
 * 落地页触达活动的外发邮件通道。
 *
 * <p>{@code knowledge-system} 的 classpath 上没有 SMTP 客户端，所以这里只暴露
 * 一个极简的下发接口，由部署方决定真实实现（例如复用 {@code knowledge-message}
 * 的 {@code EmailMessageProvider}，通过 HTTP 转发到消息服务）。</p>
 */
public interface LandingMailDispatcher {

	/**
	 * 下发一封邮件。
	 *
	 * @param to      收件邮箱
	 * @param subject 主题
	 * @param html    HTML 正文（占位符已渲染）
	 * @return true 表示下发成功
	 */
	boolean send(String to, String subject, String html);

	/** 通道名，便于日志与排障。 */
	String name();
}
