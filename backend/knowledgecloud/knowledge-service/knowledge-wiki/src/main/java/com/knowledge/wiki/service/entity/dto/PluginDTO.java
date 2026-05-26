package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import javax.validation.constraints.NotNull;

import com.knowledge.wiki.service.entity.PluginLogo;
import com.knowledge.wiki.service.entity.VersionDesc;

import lombok.Data;

@Data
public class PluginDTO implements Serializable {

    private Long id;
    private String pluginKey;
    private String name;
    private String description;
    private List<TagDTO> tags;
    private Long developerId;
    private String developerName;
    private String repoUrl;
    private List<VersionDesc> versionDescs;
    private List<PluginLogo> logos;
    private boolean publish;
    @NotNull(message = "资源路径不能为空")
    private String resourcePath;
    private List<String> features;

}
