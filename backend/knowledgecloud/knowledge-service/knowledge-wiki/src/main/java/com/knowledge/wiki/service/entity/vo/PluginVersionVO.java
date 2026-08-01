package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.List;

import com.knowledge.wiki.service.entity.VersionDesc;
import com.knowledge.wiki.service.entity.enums.PluginCategory;
import com.knowledge.wiki.service.entity.enums.PluginStatus;

import lombok.Data;

@Data
public class PluginVersionVO implements Serializable {

    private Long id;
    private String name;
    private String description;
    private String developer;
    private Long subjectId;
    private Long developerId;
    private String icon;
    private String iconMd;
    private String iconLg;
    private String iconXl;
    private String pluginKey;
    private String gitPath;
    private Long installCtn;
    private Long favoriteCtn;
    private String maintainer;
    private Long maintaineId;
    private PluginCategory category;
    private Long currentVersionId;
    private String installedVersion;
    private String resourcePath;
    private String integrity;
    private Long activeVersionId;
    private List<VersionDesc> versionDescription;
    private String version;

}
