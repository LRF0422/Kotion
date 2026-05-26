package com.knowledge.system.config;

import com.knowledge.system.interceptor.ProMembershipInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 系统模块的 WebMvc 配置
 *
 * 注册 ProMembershipInterceptor，只在当前系统服务内生效
 */
@Configuration
@RequiredArgsConstructor
public class MembershipWebMvcConfiguration implements WebMvcConfigurer {

    private final ProMembershipInterceptor proMembershipInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 只要标了 @RequireProMembership 的接口才会真正做校验
        registry.addInterceptor(proMembershipInterceptor)
                .addPathPatterns("/**");
    }
}
