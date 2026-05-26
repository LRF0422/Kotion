package com.knowledge.core.permission.config;

import java.util.List;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Autowired;

import com.knowledge.core.message.core.IEventBus;
import com.knowledge.core.permission.event.ResourceScanFinishedEvent;
import com.knowledge.core.permission.feign.IPermissionClient;
import com.knowledge.core.permission.feign.ISystemParamClient;
import com.knowledge.core.permission.feign.dto.ResourceRegisterDTO;
import com.knowledge.core.tool.utils.ApiClientUtil;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public abstract class ResourceScanner implements InitializingBean {

    private static final String RESOURCE_INIT_STATUS = "system.resource.ininStatus";

    @Autowired
    private ISystemParamClient client;
    @Autowired
    private IPermissionClient permissionClient;
    @Autowired
    private IEventBus eventBus;

    @Override
    public void afterPropertiesSet() throws Exception {
        log.info("check if the system resource inited");
        String resourceInitStatus = ApiClientUtil.resolvingResponse(client.getParamValue(RESOURCE_INIT_STATUS));
        if (StrUtil.isNotBlank(resourceInitStatus) && resourceInitStatus.equals("0")) {
            log.info("start to scan system resources");
            // permissionClient.registerPermissions(JSONUtil.toJsonStr(scanResource()));
            ResourceScanFinishedEvent event = new ResourceScanFinishedEvent();
            event.setResources(scanResource());
            event.setTag("scan");
            event.setTopic("resource");
            eventBus.dispatch(event);

        } else {
            log.info("scan system resources finished");
        }

    }

    public abstract List<ResourceRegisterDTO> scanResource();

}
