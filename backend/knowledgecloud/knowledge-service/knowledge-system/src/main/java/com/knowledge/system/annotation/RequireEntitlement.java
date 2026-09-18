package com.knowledge.system.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 声明接口所需权益。编码取 {@link com.knowledge.system.domain.EntitlementCodes} 的常量。
 *
 * @author Kotion
 */
@Target({ ElementType.METHOD, ElementType.TYPE })
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequireEntitlement {

	/** 权益编码。 */
	String value();

	/** 无权益时的提示。 */
	String message() default "该功能需要升级订阅方案";
}
