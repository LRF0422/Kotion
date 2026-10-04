package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;
import java.util.List;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;

import com.knowledge.wiki.service.entity.VersionDesc;

import lombok.Data;

@Data
public class PluginVersionPublishDTO implements Serializable {

    @NotBlank(message = "版本号不能为空")
    @Size(max = 64, message = "版本号长度不能超过64")
    @Pattern(regexp = "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$", message = "版本号必须是语义化版本x.y.z")
    private String version;

    @NotBlank(message = "资源路径不能为空")
    @Size(max = 1024, message = "资源路径长度不能超过1024")
    private String resourcePath;

    @NotBlank(message = "资源完整性哈希不能为空")
    @Pattern(regexp = "^sha384-[A-Za-z0-9+/]{64}$", message = "资源完整性哈希必须是sha384 SRI格式")
    private String integrity;

    /**
     * Optional replacement icon for the plugin (an uploaded object path).
     *
     * A version may rebrand: leaving it blank keeps the plugin's current icon.
     * Either way the candidate records the effective icon, and approval promotes
     * it to the plugin — that is when it becomes visible in the catalogue.
     */
    @Size(max = 512, message = "图标路径长度不能超过512")
    private String icon;

    @Size(max = 20, message = "能力声明不能超过20项")
    private List<String> permissions;

    @Valid
    @NotEmpty(message = "版本说明不能为空")
    @Size(max = 20, message = "版本说明不能超过20项")
    private List<VersionDesc> versionDescs;
}
