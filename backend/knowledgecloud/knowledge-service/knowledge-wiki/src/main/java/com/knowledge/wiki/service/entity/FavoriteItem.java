package com.knowledge.wiki.service.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.Icon;
import com.knowledge.core.common.base.TenantEntity;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_favorite_item", autoResultMap = true)
public class FavoriteItem extends TenantEntity {

    private Long id;
    private String name;
    private String scope;
    private Long objectId;
    private String nickName;
    private Long userId;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Icon icon;

}
