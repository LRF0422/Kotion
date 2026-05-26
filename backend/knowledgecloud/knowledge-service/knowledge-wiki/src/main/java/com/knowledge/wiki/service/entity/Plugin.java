package com.knowledge.wiki.service.entity;

import java.util.List;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.knowledge.core.version.BaseSubject;
import com.knowledge.wiki.service.entity.dto.TagDTO;
import com.knowledge.wiki.service.entity.enums.PluginCategory;
import com.knowledge.wiki.service.entity.enums.PluginStatus;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName(value = "wiki_plugin", autoResultMap = true)
public class Plugin extends BaseSubject {

    private String name;
    private String description;
    private String developer;
    private Long developerId;
    private String icon;
    private String iconMd;
    private String iconLg;
    private String iconXl;
    private String pluginKey;
    private String gitPath;
    private PluginStatus status;
    private Long installCtn;
    private Long favoriteCtn;
    private PluginCategory category;
    private String maintainer;
    private Long maintainerId;
    private Double rating;
    private Long reviews;
    private Long downloads;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> features;
    private String screenShot;

    @TableField(exist = false)
    private String resourcePath;
    @TableField(exist = false)
    private List<TagDTO> tags;
    @TableField(exist = false)
    private List<VersionDesc> versionDescs;

}
