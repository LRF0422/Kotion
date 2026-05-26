package com.knowledge.system.interceptor;

import com.knowledge.core.permission.core.annotation.RequireProMembership;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.ResultCode;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.system.service.IUserMembershipService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.lang.reflect.Method;

/**
 * Pro会员权限拦截器（系统模块）
 *
 * 放在业务系统层，避免core模块依赖system模块
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProMembershipInterceptor implements HandlerInterceptor {

    private final IUserMembershipService userMembershipService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 只处理方法级别的请求
        if (!(handler instanceof HandlerMethod)) {
            return true;
        }

        HandlerMethod handlerMethod = (HandlerMethod) handler;
        Method method = handlerMethod.getMethod();
        Class<?> clazz = handlerMethod.getBeanType();

        // 检查方法上是否有注解
        RequireProMembership methodAnnotation = method.getAnnotation(RequireProMembership.class);
        // 检查类上是否有注解
        RequireProMembership classAnnotation = clazz.getAnnotation(RequireProMembership.class);

        // 如果没有注解，直接放行
        if (methodAnnotation == null && classAnnotation == null) {
            return true;
        }

        // 获取用户ID
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null) {
            throw new BusinessException(ResultCode.UN_AUTHORIZED.getCode(), "用户未登录");
        }

        // 检查用户是否有Pro权限
        boolean hasPro = userMembershipService.hasProMembership(userId);

        if (!hasPro) {
            RequireProMembership annotation = methodAnnotation != null ? methodAnnotation : classAnnotation;
            String message = annotation.message();
            boolean throwException = annotation.throwException();

            if (throwException) {
                throw new BusinessException(ResultCode.FAILURE.getCode(), message);
            } else {
                // 可以重定向到升级页面或其他处理
                log.warn("用户 {} 尝试访问Pro功能: {}", userId, request.getRequestURI());
                return false;
            }
        }

        return true;
    }
}
