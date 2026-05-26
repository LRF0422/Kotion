package com.knowledge.core.permission.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;

@FeignClient(AppConstant.APPLICATION_SYSTEM_NAME)
public interface ISystemParamClient {

    String API_PREFIX = "/param";
    
    @GetMapping(API_PREFIX + "/value")
    R<String> getParamValue(@RequestParam("paramKey") String paramKey);
    
}
