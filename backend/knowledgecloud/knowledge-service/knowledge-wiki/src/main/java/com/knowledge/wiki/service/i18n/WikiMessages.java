package com.knowledge.wiki.service.i18n;

import org.springframework.context.MessageSource;
import org.springframework.context.i18n.LocaleContextHolder;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * 业务消息国际化解析。
 *
 * <p>业务异常（{@link com.knowledge.wiki.service.exception.WikiException}）只声明
 * i18n key + 中文兜底文案，返回给前端的文案在抛异常时按请求语言解析：
 * 前端用 {@code Accept-Language} 带上当前界面语言，Spring 的
 * {@link LocaleContextHolder} 因此拿到对应 {@link Locale}，命中
 * {@code i18n/messages_*.properties}。解析不到时回退到中文默认文案，
 * 缺翻译不会导致消息丢失。
 */
@Component
public class WikiMessages {

    /** 没有任何语言上下文时的兜底语言（中文）。 */
    private static final Locale FALLBACK_LOCALE = Locale.SIMPLIFIED_CHINESE;

    private static volatile MessageSource messageSource;

    public WikiMessages(MessageSource messageSource) {
        WikiMessages.messageSource = messageSource;
    }

    /**
     * 按当前请求语言解析消息。
     *
     * @param key            i18n key（{@code i18n/messages*.properties}）
     * @param defaultMessage key 缺失时的中文兜底文案
     * @return 本地化后的消息；无法解析时返回 {@code defaultMessage}
     */
    public static String get(String key, String defaultMessage) {
        MessageSource source = messageSource;
        if (source == null || key == null || key.isEmpty()) {
            return defaultMessage;
        }
        Locale locale = LocaleContextHolder.getLocale();
        if (locale == null) {
            locale = FALLBACK_LOCALE;
        }
        try {
            // 不向 MessageSource 传参数：{} 占位符保留到 BusinessException 抛出时
            // 统一填充（见 BusinessException#analyticalExpression），同时也避免
            // MessageFormat 把业务文案里的其它花括号当成参数。
            return source.getMessage(key, null, defaultMessage, locale);
        } catch (Exception e) {
            // 消息源不可用（配置缺失/资源损坏）时退化为中文兜底，绝不因翻译失败丢消息
            return defaultMessage;
        }
    }
}
