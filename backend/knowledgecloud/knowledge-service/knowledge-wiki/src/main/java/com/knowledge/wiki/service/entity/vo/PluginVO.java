package com.knowledge.wiki.service.entity.vo;

import java.io.Serializable;
import java.util.List;

import com.knowledge.wiki.service.entity.enums.InstalledPluginStatus;
import com.knowledge.wiki.service.entity.enums.PluginCategory;
import com.knowledge.wiki.service.entity.enums.PluginStatus;

import lombok.Data;

@Data
public class PluginVO implements Serializable {
    private Long id;
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
    private String maintainer;
    private Long maintaineId;
    private PluginCategory category;
    private Long currentVersionId;
    private String installedVersion;
    private PluginVersionVO currentVersion;
    private List<PluginVersionVO> installeddVersions;
    private List<String> features;
    private Double rating;
    private Long reviews;
    private Long downloads;
    private String screenShot;
    private String resourcePath;
    /** Runtime install status of the current user: null = not installed, ACTIVE / DISABLED. */
    private InstalledPluginStatus installStatus;
}
