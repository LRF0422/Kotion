package com.knowledge.filecenter.upload;

import org.springframework.stereotype.Component;

import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.secure.utils.SecurityContextUtil;

import cn.hutool.core.util.StrUtil;

@Component
public class UploadOwnerProvider {

    public UploadOwner currentOwner() {
        String tenantId = SecurityContextUtil.getTenantId();
        Long userId = SecurityContextUtil.getUserId();
        if (StrUtil.isBlank(tenantId) || userId == null || userId <= 0L) {
            throw new ServiceException("Authenticated tenant and user are required");
        }
        return new UploadOwner(tenantId, userId);
    }
}
