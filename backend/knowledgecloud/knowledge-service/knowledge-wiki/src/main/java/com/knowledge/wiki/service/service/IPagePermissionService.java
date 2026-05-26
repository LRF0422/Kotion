package com.knowledge.wiki.service.service;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.PagePermission;

public interface IPagePermissionService extends MPJBaseService<PagePermission> {

    void createPermission(PagePermission pagePermission);

}
