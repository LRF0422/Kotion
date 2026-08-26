package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

import com.knowledge.wiki.service.entity.VersionDesc;
import com.knowledge.wiki.service.entity.enums.PluginCategory;

import lombok.Data;

@Data
public class PluginSubmissionDTO implements Serializable {

    private Long id;

    @NotBlank(message = "插件名称不能为空")
    @Size(min = 2, max = 50, message = "插件名称长度必须在2到50之间")
    private String name;

    @NotBlank(message = "pluginKey不能为空")
    @Size(min = 2, max = 50, message = "pluginKey长度必须在2到50之间")
    @Pattern(regexp = "^[a-z0-9-]+$", message = "pluginKey只能包含小写字母、数字和连字符")
    private String pluginKey;

    @NotBlank(message = "版本号不能为空")
    @Size(max = 64, message = "版本号长度不能超过64")
    @Pattern(regexp = "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$", message = "版本号必须是语义化版本x.y.z")
    private String version;

    @NotNull(message = "插件分类不能为空")
    private PluginCategory category;

    @NotEmpty(message = "至少需要一个标签")
    @Size(max = 5, message = "最多只能设置5个标签")
    private List<@NotBlank(message = "标签不能为空") @Size(max = 30, message = "标签长度不能超过30") String> tags;

    @Size(max = 512, message = "图标路径长度不能超过512")
    private String icon;

    @NotBlank(message = "插件描述不能为空")
    @Size(min = 10, max = 500, message = "插件描述长度必须在10到500之间")
    private String description;

    @NotBlank(message = "资源路径不能为空")
    @Size(max = 1024, message = "资源路径长度不能超过1024")
    private String resourcePath;

    @NotBlank(message = "资源完整性哈希不能为空")
    @Pattern(regexp = "^sha384-[A-Za-z0-9+/]{64}$", message = "资源完整性哈希必须是sha384 SRI格式")
    private String integrity;

    @Valid
    @NotEmpty(message = "版本说明不能为空")
    @Size(max = 20, message = "版本说明不能超过20项")
    private List<VersionDesc> versionDescs;
}
