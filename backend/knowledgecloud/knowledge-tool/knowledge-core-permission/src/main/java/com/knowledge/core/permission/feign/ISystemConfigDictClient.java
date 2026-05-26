package com.knowledge.core.permission.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;

@FeignClient(AppConstant.APPLICATION_SYSTEM_NAME)
public interface ISystemConfigDictClient {

    String API_PERFIX = "/dict";

    @GetMapping(API_PERFIX + "/getValue")
    R<String> getSystemConfigValue(@RequestParam("code") String code, @RequestParam("dictKey") Integer dictKey);

    
}
