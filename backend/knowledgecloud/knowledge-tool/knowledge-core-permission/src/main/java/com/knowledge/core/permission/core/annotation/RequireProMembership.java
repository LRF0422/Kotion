package com.knowledge.core.permission.core.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Pro会员权限注解
 * 用于标记需要Pro会员权限才能访问的方法或类
 *
 * @author Qwen
 */
@Target({ ElementType.METHOD, ElementType.TYPE })
@Retention(RetentionPolicy.RUNTIME)
public @interface RequireProMembership {

    /**
     * 错误提示信息
     */
    String message() default "该功能需要Pro会员权限";

    /**
     * 是否抛出异常
     */
    boolean throwException() default true;
}