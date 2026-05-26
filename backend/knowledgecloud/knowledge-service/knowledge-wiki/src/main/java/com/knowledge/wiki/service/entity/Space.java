package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.common.base.Icon;
import com.knowledge.core.common.base.TenantEntity;
import com.knowledge.wiki.service.entity.enums.SpaceStatus;
import com.knowledge.wiki.service.entity.enums.SpaceType;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_space", autoResultMap = true)
public class Space extends TenantEntity {
    private Long id;
    private Long userId;
    private String nickName;
    private String name;
    private SpaceStatus status;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Icon icon;
    private String description;
    private Long homePageId;
    private SpaceType type;
    private String cover;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> screenShot;
}
