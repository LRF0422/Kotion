package com.knowledge.core.permission.config;

import com.knowledge.core.permission.core.AbstractPermissionService;
import com.knowledge.core.permission.core.annotation.AccessControled;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.utils.WebUtil;

import cn.hutool.extra.spring.SpringUtil;
import cn.hutool.http.server.HttpServerRequest;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Method;
import java.nio.file.AccessDeniedException;

import javax.servlet.http.HttpServletRequest;

@Aspect
@Configuration
@Slf4j
public class AccessControlAspect extends AbstractPermissionService {

	@Around("@annotation(accessControl)")
	@SneakyThrows
	public Object round(ProceedingJoinPoint point, AccessControled accessControl) {
		RequestMapping requestMapping = AnnotatedElementUtils.findMergedAnnotation(getMethod(point),
				RequestMapping.class);
		if (requestMapping != null) {
			HttpServletRequest request = WebUtil.getRequest();
			String path = request.getRequestURI();
			boolean hasPermission = hasPermission(path);
			if (!hasPermission) {
				throw new AccessDeniedException(
						String.format("user %s has no right to access %s", SecurityContextUtil.getUserName(), path));
			}
		}
		return point.proceed();
	}

	private Method getMethod(ProceedingJoinPoint point) {
		MethodSignature signature = (MethodSignature) point.getSignature();
		return signature.getMethod();
	}

}
