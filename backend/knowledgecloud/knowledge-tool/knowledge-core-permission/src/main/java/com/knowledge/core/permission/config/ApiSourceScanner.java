package com.knowledge.core.permission.config;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.permission.core.annotation.AccessControled;
import com.knowledge.core.permission.feign.dto.ResourceRegisterDTO;

import cn.hutool.extra.spring.SpringUtil;

// @Component
public class ApiSourceScanner extends ResourceScanner {

    @Override
    public List<ResourceRegisterDTO> scanResource() {
        return doScanResource();
    }

    private List<ResourceRegisterDTO> doScanResource() {
        List<ResourceRegisterDTO> resources = new ArrayList<>();
        Map<String, ?> benaMap = SpringUtil.getApplicationContext().getBeansWithAnnotation(RestController.class);
        benaMap.forEach((bean, value) -> {
            Object instance = value;
            if (instance.getClass().isAnnotationPresent(AccessControled.class)
                    && instance.getClass().isAnnotationPresent(RequestMapping.class)) {
                RequestMapping parent = instance.getClass().getAnnotation(RequestMapping.class);
                String parenatStr = parent.value()[0];
                Method[] methods = instance.getClass().getDeclaredMethods();
                Stream.of(methods).forEach(method -> {
                    if (AnnotatedElementUtils.getMergedAnnotation(method, RequestMapping.class) != null) {
                        RequestMapping child = AnnotatedElementUtils.getMergedAnnotation(method,
                                RequestMapping.class);
                        String childStr = child.value()[0];
                        String apipath = parenatStr + childStr;
                        resources.add(new ResourceRegisterDTO()
                                .setName(apipath)
                                .setAlias(apipath)
                                .setContent(apipath)
                                .setCategory("API")
                                .setAllowActions(Arrays.asList("*")));
                    }
                });
            }
        });
        return resources;
    }

}
