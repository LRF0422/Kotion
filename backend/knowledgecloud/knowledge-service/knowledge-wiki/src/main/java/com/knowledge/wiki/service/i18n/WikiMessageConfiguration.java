package com.knowledge.wiki.service.i18n;

import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.support.ReloadableResourceBundleMessageSource;

/**
 * 业务消息的 {@link MessageSource}：{@code classpath:i18n/messages*.properties}。
 *
 * <p>显式声明而不依赖 Spring Boot 自动配置：自动配置要求
 * {@code spring.messages.basename} 指向的资源存在，显式声明更可控，且平台目前
 * 没有其它 {@code messageSource} Bean（Boot 的自动配置带
 * {@code @ConditionalOnMissingBean}，会因本 Bean 存在而退让）。
 *
 * <p>用 {@link ReloadableResourceBundleMessageSource} 而不是
 * {@code ResourceBundleMessageSource}：Java 8 下前者按 {@code defaultEncoding}
 * 读取 properties，中文文案可以直接写 UTF-8，不需要 native2ascii 转义。
 */
@Configuration
public class WikiMessageConfiguration {

    @Bean
    public MessageSource messageSource() {
        ReloadableResourceBundleMessageSource source = new ReloadableResourceBundleMessageSource();
        source.setBasenames("classpath:i18n/messages");
        source.setDefaultEncoding("UTF-8");
        // 不要跟随 JVM 默认语言漂移：解析不到请求语言时用 messages.properties（中文）
        source.setFallbackToSystemLocale(false);
        // key 缺失时返回 null，交给 WikiMessages 用中文兜底文案
        source.setUseCodeAsDefaultMessage(false);
        return source;
    }
}
