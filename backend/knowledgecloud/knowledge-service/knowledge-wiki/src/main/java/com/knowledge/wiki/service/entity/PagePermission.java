package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableName;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.entity.enums.PagePermissionEnum;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("wiki_page_permission")
public class PagePermission extends TenantEntity {

    private Long id;
    private Long userId;
    private Long pageId;
    private List<PagePermissionEnum> permissions;

}
