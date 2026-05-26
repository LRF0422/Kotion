package com.knowledge.wiki.service.service.impl;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.PagePermission;
import com.knowledge.wiki.service.mapper.PagePermissionMapper;
import com.knowledge.wiki.service.service.IPagePermissionService;

@Service
public class PagePermissionServiceImpl extends MPJBaseServiceImpl<PagePermissionMapper, PagePermission>
                implements IPagePermissionService {

        @Override
        public void createPermission(PagePermission pagePermission) {
                if (!checkExists(pagePermission)) {
                        this.save(pagePermission);
                }
        }

        private boolean checkExists(PagePermission pagePermission) {
                return lambdaQuery()
                                .eq(PagePermission::getUserId, pagePermission.getUserId())
                                .eq(PagePermission::getPageId, pagePermission.getPageId())
                                .exists();
        }
}
